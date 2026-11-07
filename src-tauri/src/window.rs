//! The main window, built here instead of from tauri.conf.json (where it has `"create": false`):
//! release builds load the frontend from frontend_server.rs, and pages that ask for a new window
//! (target=_blank links, the YouTube player's links) open in the system browser instead of the app.

use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::{App, WebviewUrl};
use tauri_plugin_opener::OpenerExt;

pub fn create_main(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let mut config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .ok_or("tauri.conf.json defines no main window")?;
    if !tauri::is_dev() {
        config.url = WebviewUrl::External(crate::frontend_server::start(app)?);
    }
    // Windows: drops go to the page, which gets file paths from webview2.rs.
    if cfg!(windows) {
        config.drag_drop_enabled = false;
    }
    let handle = app.handle().clone();
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::from_config(app.handle(), &config)?.on_new_window(move |url, _features| {
        if matches!(url.scheme(), "http" | "https" | "mailto") {
            if let Err(e) = handle.opener().open_url(url.as_str(), None::<&str>) {
                log::warn!("could not open {url}: {e}");
            }
        }
        NewWindowResponse::Deny
    });
    // Windows: the page never leaves the app's origin (links are sent to the browser by the page,
    // renderer/platform/tauriBridge.ts). Only Windows reports main-frame navigations alone; on
    // macOS and Linux the handler also sees the YouTube player's frames, so it is not set there.
    #[cfg(windows)]
    {
        let home = match &config.url {
            WebviewUrl::External(url) => Some(url.origin()),
            _ => app.config().build.dev_url.as_ref().map(|url| url.origin()),
        };
        builder = builder.on_navigation(move |url| {
            let allowed = url.scheme() == "about" || home.as_ref().is_none_or(|home| url.origin() == *home);
            if !allowed {
                log::warn!("kept the main window from navigating to {url}");
            }
            allowed
        });
    }
    let window = builder.build()?;
    #[cfg(windows)]
    crate::webview2::forward_dropped_files(&window)?;
    #[cfg(windows)]
    if crate::sys::info::start_muted() {
        crate::webview2::mute_page(&window)?;
    }
    #[cfg(not(windows))]
    let _ = window;
    Ok(())
}
