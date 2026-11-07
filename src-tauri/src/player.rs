//! Native video: one libmpv instance per window, drawing into that window (`--wid`) under the
//! webview. The page leaves the video area transparent and draws subtitles and controls on top.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use miteiru_mpv::{ClientOptions, Event, MpvClient, VideoOutput};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

#[derive(Default)]
pub struct Players(Mutex<HashMap<String, Arc<MpvClient>>>);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayerEvent {
    r#type: &'static str,
    name: Option<String>,
    value: Option<String>,
    reason: Option<String>,
    error: Option<String>,
    level: Option<String>,
    text: Option<String>,
}

impl PlayerEvent {
    fn new(kind: &'static str) -> Self {
        PlayerEvent { r#type: kind, name: None, value: None, reason: None, error: None, level: None, text: None }
    }
}

#[derive(Deserialize)]
pub struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

const LIB_NAME: &str = if cfg!(windows) {
    "libmpv-2.dll"
} else if cfg!(target_os = "macos") {
    "libmpv.2.dylib"
} else {
    "libmpv.so.2"
};

/// The bundled libmpv (resources/libmpv), the repo copy in dev, or MITEIRU_LIBMPV. On Linux a bare
/// name lets the system loader find the distribution's libmpv.
fn libmpv_path(app: &AppHandle) -> PathBuf {
    if let Ok(p) = std::env::var("MITEIRU_LIBMPV") {
        return PathBuf::from(p);
    }
    let mut candidates = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join("libmpv").join(LIB_NAME));
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("resources").join("libmpv").join(LIB_NAME));
    candidates.into_iter().find(|p| p.exists()).unwrap_or_else(|| PathBuf::from(LIB_NAME))
}

#[cfg(windows)]
fn native_window_id(window: &WebviewWindow) -> Result<i64, String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window.window_handle().map_err(|e| e.to_string())?;
    match handle.as_raw() {
        // mpv takes the HWND as a uint32_t (handles are 32-bit) and rejects negative values.
        RawWindowHandle::Win32(h) => Ok(h.hwnd.get() as u32 as i64),
        RawWindowHandle::AppKit(h) => Ok(h.ns_view.as_ptr() as i64),
        RawWindowHandle::Xlib(h) => Ok(h.window as i64),
        RawWindowHandle::Xcb(h) => Ok(h.window.get() as i64),
        other => Err(format!("native video is not supported on this window system ({other:?})")),
    }
}

/// mpv's own child window must stay below the webview's, or it would cover the page.
#[cfg(windows)]
fn lower_video_window(hwnd: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_BOTTOM, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
    };
    if let Ok(h) = hwnd.trim().parse::<i64>() {
        unsafe {
            SetWindowPos(h as _, HWND_BOTTOM, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    }
}

#[cfg(not(windows))]
fn lower_video_window(_hwnd: &str) {}

fn client(state: &State<Players>, window: &WebviewWindow) -> Result<Arc<MpvClient>, String> {
    state.0.lock().unwrap().get(window.label()).cloned().ok_or_else(|| "player is not open".to_string())
}

#[tauri::command]
pub fn player_open(
    app: AppHandle,
    window: WebviewWindow,
    state: State<Players>,
    options: Option<HashMap<String, String>>,
) -> Result<(), String> {
    if state.0.lock().unwrap().contains_key(window.label()) {
        return Ok(());
    }
    // Windows: mpv draws into the window itself (--wid). macOS and Linux render through the
    // render API into a GL view placed under the webview (see video_gl.rs).
    #[cfg(windows)]
    let video = VideoOutput::Window(native_window_id(&window)?);
    #[cfg(not(windows))]
    let video = VideoOutput::RenderApi;
    let target = window.clone();
    let on_event: miteiru_mpv::EventFn = Arc::new(move |e: Event| {
        let mut out = PlayerEvent::new("property");
        match e {
            Event::Property { name, value } => {
                if name == "window-id" {
                    if let Some(v) = &value {
                        lower_video_window(v);
                    }
                }
                out.name = Some(name);
                out.value = value;
            }
            Event::EndFile { reason, error } => {
                out.r#type = "end-file";
                out.reason = Some(reason);
                out.error = error;
            }
            Event::Log { level, text, .. } => {
                out.r#type = "log";
                out.level = Some(level);
                out.text = Some(text);
            }
            Event::Notice(kind) => out.r#type = kind,
            Event::Shutdown => out.r#type = "shutdown",
        }
        let _ = target.emit_to(target.label(), "player://event", out);
    });
    let mpv = MpvClient::new(
        ClientOptions {
            dll_path: libmpv_path(&app),
            video,
            mpv_options: options.unwrap_or_default().into_iter().collect(),
        },
        on_event,
    )?;
    let mpv = Arc::new(mpv);
    #[cfg(windows)]
    mpv.observe(&["window-id".to_string()])?;
    #[cfg(not(windows))]
    crate::video_gl::attach(&window, mpv.clone())?;
    // The page shows the video through a transparent background.
    let _ = window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
    state.0.lock().unwrap().insert(window.label().to_string(), mpv);
    Ok(())
}

#[tauri::command]
pub fn player_command(window: WebviewWindow, state: State<Players>, args: Vec<String>) -> Result<(), String> {
    client(&state, &window)?.command(&args)
}

#[tauri::command]
pub fn player_set(window: WebviewWindow, state: State<Players>, name: String, value: String) -> Result<(), String> {
    client(&state, &window)?.set_property(&name, &value)
}

#[tauri::command]
pub fn player_get(window: WebviewWindow, state: State<Players>, name: String) -> Result<Option<String>, String> {
    Ok(client(&state, &window)?.get_property(&name))
}

#[tauri::command]
pub fn player_observe(window: WebviewWindow, state: State<Players>, names: Vec<String>) -> Result<(), String> {
    client(&state, &window)?.observe(&names)
}

/// Fit the video into `rect` (CSS pixels) of a `viewport`-sized page, using mpv's margin ratios.
#[tauri::command]
pub fn player_set_rect(window: WebviewWindow, state: State<Players>, rect: Rect, viewport: Rect) -> Result<(), String> {
    let mpv = client(&state, &window)?;
    let (vw, vh) = (viewport.width.max(1.0), viewport.height.max(1.0));
    let clamp = |v: f64| v.clamp(0.0, 1.0);
    let margins = [
        ("video-margin-ratio-left", rect.x / vw),
        ("video-margin-ratio-right", (vw - rect.x - rect.width) / vw),
        ("video-margin-ratio-top", rect.y / vh),
        ("video-margin-ratio-bottom", (vh - rect.y - rect.height) / vh),
    ];
    for (name, value) in margins {
        mpv.set_property(name, &format!("{:.5}", clamp(value)))?;
    }
    Ok(())
}

#[tauri::command]
pub fn player_close(window: WebviewWindow, state: State<Players>) {
    if let Some(mpv) = state.0.lock().unwrap().remove(window.label()) {
        #[cfg(not(windows))]
        crate::video_gl::detach(window.label());
        // Tear down off the IPC thread: mpv may take a moment to stop.
        std::thread::spawn(move || mpv.destroy());
        let _ = window.set_background_color(None);
    }
}

/// Drop a window's player when the window goes away.
pub fn on_window_destroyed(app: &AppHandle, label: &str) {
    if let Some(state) = app.try_state::<Players>() {
        if let Some(mpv) = state.0.lock().unwrap().remove(label) {
            // The render context must go before mpv does.
            #[cfg(not(windows))]
            crate::video_gl::forget(label);
            std::thread::spawn(move || mpv.destroy());
        }
    }
}
