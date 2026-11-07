//! Windows-only WebView2 additions.
//!
//! Dropped files. The window's native drag-and-drop handler is off (window.rs). wry's handler accepts
//! only files and swallows everything else, so with it on, a dragged YouTube link or an image
//! dropped on the OCR panel never reached the page. Without it, WebView2 delivers drops to the page
//! as a browser does, and dropped files arrive as `File` objects without their paths.
//!
//! The page hands those files back with `chrome.webview.postMessageWithAdditionalObjects(
//! '{"miteiru":"file-drop","id":1}', files)` (renderer/platform/tauriBridge.ts). WebView2 then gives
//! the host each file's path, sent back to the page as a `miteiru://file-drop` event `{id, paths}`.
//!
//! The message must be a string. wry's handler runs first, fails on any message that isn't a string,
//! and that stops WebView2 from calling later handlers such as this one. wry passes strings to
//! Tauri's IPC, which logs one console error for this message (it is not a command) and ignores it.

use serde::{Deserialize, Serialize};
use tauri::{Emitter, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2File, ICoreWebView2WebMessageReceivedEventArgs, ICoreWebView2WebMessageReceivedEventArgs2,
    ICoreWebView2_8,
};
use webview2_com::{take_pwstr, WebMessageReceivedEventHandler};
use windows_core::{Interface, PWSTR};

#[derive(Deserialize)]
struct DropMessage {
    miteiru: String,
    id: u64,
}

#[derive(Clone, Serialize)]
struct DropPaths {
    id: u64,
    paths: Vec<String>,
}

/// The paths of the files attached to a `file-drop` message, or `None` for any other message.
fn dropped_paths(args: &ICoreWebView2WebMessageReceivedEventArgs) -> windows_core::Result<Option<DropPaths>> {
    let text = unsafe {
        let mut text = PWSTR::null();
        if args.TryGetWebMessageAsString(&mut text).is_err() {
            return Ok(None);
        }
        take_pwstr(text)
    };
    let Ok(message) = serde_json::from_str::<DropMessage>(&text) else {
        return Ok(None);
    };
    if message.miteiru != "file-drop" {
        return Ok(None);
    }
    let mut paths = Vec::new();
    unsafe {
        let objects = args.cast::<ICoreWebView2WebMessageReceivedEventArgs2>()?.AdditionalObjects()?;
        let mut count = 0;
        objects.Count(&mut count)?;
        for index in 0..count {
            if let Ok(file) = objects.GetValueAtIndex(index)?.cast::<ICoreWebView2File>() {
                let mut path = PWSTR::null();
                file.Path(&mut path)?;
                paths.push(take_pwstr(path));
            }
        }
    }
    Ok(Some(DropPaths { id: message.id, paths }))
}

/// MITEIRU_MUTED=1 (tests, debugging): the page's own sound, such as a YouTube video, is muted too.
pub fn mute_page(window: &WebviewWindow) -> tauri::Result<()> {
    window.with_webview(|webview| {
        let muted = unsafe {
            webview
                .controller()
                .CoreWebView2()
                .and_then(|core| core.cast::<ICoreWebView2_8>())
                .and_then(|core| core.SetIsMuted(true))
        };
        if let Err(e) = muted {
            log::warn!("could not mute the page: {e}");
        }
    })
}

pub fn forward_dropped_files(window: &WebviewWindow) -> tauri::Result<()> {
    let emitter = window.clone();
    window.with_webview(move |webview| {
        let handler = WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            match dropped_paths(&args) {
                Ok(Some(drop)) => {
                    if let Err(e) = emitter.emit("miteiru://file-drop", drop) {
                        log::warn!("file drop: could not send the paths to the page: {e}");
                    }
                }
                Ok(None) => {}
                Err(e) => log::warn!("file drop: could not read the dropped files: {e}"),
            }
            Ok(())
        }));
        let mut token = 0i64;
        let added = unsafe { webview.controller().CoreWebView2().and_then(|core| core.add_WebMessageReceived(&handler, &mut token)) };
        if let Err(e) = added {
            log::warn!("file drop: dropped files will not open ({e})");
        }
    })
}
