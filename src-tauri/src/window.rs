//! The main window, built here instead of from tauri.conf.json (where it has `"create": false`) so
//! pages that ask for a new window (target=_blank links, the YouTube player's links) open in the
//! system browser instead of inside the app.

use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};
use tauri::App;
use tauri_plugin_opener::OpenerExt;

pub fn create_main(app: &App) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == "main")
        .cloned()
        .expect("tauri.conf.json defines the main window");
    let handle = app.handle().clone();
    WebviewWindowBuilder::from_config(app.handle(), &config)?
        .on_new_window(move |url, _features| {
            if matches!(url.scheme(), "http" | "https" | "mailto") {
                if let Err(e) = handle.opener().open_url(url.as_str(), None::<&str>) {
                    log::warn!("could not open {url}: {e}");
                }
            }
            NewWindowResponse::Deny
        })
        .build()?;
    Ok(())
}
