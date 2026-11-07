//! Release builds serve the bundled frontend on http://127.0.0.1:<port> instead of the `tauri://`
//! scheme. Pages on a custom scheme send YouTube no usable Referer on macOS and Linux, and its
//! player refuses such embeds (error 153). The files are the same embedded `frontendDist` the
//! custom protocol would serve, and only this exact origin is granted the app's commands.
//!
//! The port is saved in the data folder and reused on the next launch: the webview keeps
//! localStorage, IndexedDB and cookies (YouTube's too) per origin, and the origin includes the port.

use std::path::PathBuf;

use tauri::ipc::CapabilityBuilder;
use tauri::{App, Manager, Url};

/// Whether a request to one of Miteiru's local servers names that server as its host. A web page
/// can make the browser send requests to 127.0.0.1 under its own domain (DNS rebinding); those
/// carry that domain in Host and are refused.
pub(crate) fn is_local_request(request: &tiny_http::Request, port: u16) -> bool {
    let Some(host) = request.headers().iter().find(|h| h.field.equiv("Host")) else {
        return false;
    };
    let host = host.value.as_str();
    [format!("127.0.0.1:{port}"), format!("localhost:{port}")]
        .iter()
        .any(|allowed| host.eq_ignore_ascii_case(allowed))
}

fn port_file() -> PathBuf {
    crate::sys::info::user_data_dir().join("frontend-port")
}

/// The saved port if it is still free, otherwise any free one.
fn bind() -> Result<tiny_http::Server, String> {
    let saved = std::fs::read_to_string(port_file()).ok().and_then(|text| text.trim().parse::<u16>().ok());
    if let Some(port) = saved.filter(|port| *port != 0) {
        match tiny_http::Server::http(("127.0.0.1", port)) {
            Ok(server) => return Ok(server),
            Err(e) => log::warn!("port {port} is unavailable ({e}); the page's web storage starts empty"),
        }
    }
    tiny_http::Server::http("127.0.0.1:0").map_err(|e| format!("frontend server: {e}"))
}

fn save_port(port: u16) {
    let path = port_file();
    let written = path
        .parent()
        .map_or(Ok(()), std::fs::create_dir_all)
        .and_then(|_| std::fs::write(&path, port.to_string()));
    if let Err(e) = written {
        log::warn!("could not save the frontend port to {}: {e}", path.display());
    }
}

/// Starts serving and returns the URL of the home page.
pub fn start(app: &App) -> Result<Url, String> {
    let server = bind()?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("frontend server has no TCP address")?;
    save_port(port);
    let origin = format!("http://127.0.0.1:{port}");

    // The page is a "remote" origin to Tauri, so it gets the same permissions as the bundled
    // frontend (capabilities/default.json), for this port only.
    app.add_capability(
        CapabilityBuilder::new("frontend-server")
            .remote(origin.clone())
            .window("main")
            .permission("core:default")
            .permission("core:window:allow-set-fullscreen")
            .permission("app-commands")
            .permission("updater:default")
            .permission("process:allow-restart"),
    )
    .map_err(|e| format!("frontend capability: {e}"))?;

    let assets = app.asset_resolver();
    std::thread::Builder::new()
        .name("miteiru-frontend".into())
        .spawn(move || {
            for request in server.incoming_requests() {
                if !is_local_request(&request, port) {
                    let _ = request.respond(tiny_http::Response::from_data(b"Misdirected request".to_vec()).with_status_code(421));
                    continue;
                }
                let path = request.url().split(['?', '#']).next().unwrap_or("/").to_string();
                let response = match assets.get(path) {
                    Some(asset) => {
                        let mut response = tiny_http::Response::from_data(asset.bytes);
                        let mut headers = vec![("Content-Type", asset.mime_type), ("Cache-Control", "no-cache".into())];
                        if let Some(csp) = asset.csp_header {
                            headers.push(("Content-Security-Policy", csp));
                        }
                        for (name, value) in headers {
                            if let Ok(header) = tiny_http::Header::from_bytes(name, value) {
                                response.add_header(header);
                            }
                        }
                        response
                    }
                    None => tiny_http::Response::from_data(b"Not found".to_vec()).with_status_code(404),
                };
                let _ = request.respond(response);
            }
        })
        .map_err(|e| e.to_string())?;
    format!("{origin}/home/").parse().map_err(|e| format!("frontend URL: {e}"))
}
