//! Release builds serve the bundled frontend on http://127.0.0.1:<port> instead of the `tauri://`
//! scheme. Pages on a custom scheme send YouTube no usable Referer on macOS and Linux, and its
//! player refuses such embeds (error 153). The files are the same embedded `frontendDist` the
//! custom protocol would serve; capabilities/localhost.json grants this origin the app's commands.

use tauri::{App, Url};

/// Starts serving on a free port and returns the URL of the home page.
pub fn start(app: &App) -> Result<Url, String> {
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| format!("frontend server: {e}"))?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("frontend server has no TCP address")?;
    let assets = app.asset_resolver();
    std::thread::Builder::new()
        .name("miteiru-frontend".into())
        .spawn(move || {
            for request in server.incoming_requests() {
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
    format!("http://127.0.0.1:{port}/home/").parse().map_err(|e| format!("frontend URL: {e}"))
}
