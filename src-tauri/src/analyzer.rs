//! Transport for the local analyzer API (docs/ANALYZER_SERVER.md): Rust owns the socket on
//! 127.0.0.1, the backend worker answers (main/handler/languages/analyzerServer.ts). Each request is
//! sent to the webview as an `analyzer://request` event and answered through `analyzer_respond`.

use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

/// How long a request may wait for the worker. Generous: a large batch on a cold dictionary is slow.
const ANSWER_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_BODY: u64 = 16 * 1024 * 1024;

type Pending = Arc<Mutex<HashMap<u64, (Instant, tiny_http::Request)>>>;

#[derive(Default)]
pub struct Analyzer {
    port: Mutex<Option<u16>>,
    pending: Pending,
}

#[derive(Clone, Serialize)]
struct AnalyzerRequest {
    id: u64,
    method: String,
    path: String,
    token: Option<String>,
    body: String,
}

fn json_response(status: u16, body: String) -> tiny_http::Response<std::io::Cursor<Vec<u8>>> {
    let header = tiny_http::Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap();
    tiny_http::Response::from_string(body).with_status_code(status).with_header(header)
}

fn fail(request: tiny_http::Request, status: u16, message: &str) {
    let body = serde_json::json!({"ok": false, "error": message}).to_string();
    let _ = request.respond(json_response(status, body));
}

/// Starts listening (once per app run; later calls return the same port).
#[tauri::command]
pub async fn analyzer_start(app: AppHandle, state: State<'_, Analyzer>) -> Result<u16, String> {
    let mut port_slot = state.port.lock().unwrap();
    if let Some(port) = *port_slot {
        // A new backend worker (the page reloaded): the old one will not answer what it was sent.
        let stale: Vec<tiny_http::Request> =
            state.pending.lock().unwrap().drain().map(|(_, (_, request))| request).collect();
        for request in stale {
            fail(request, 503, "Miteiru restarted before answering; try again.");
        }
        return Ok(port);
    }
    let server = tiny_http::Server::http("127.0.0.1:0").map_err(|e| format!("analyzer server: {e}"))?;
    let port = server.server_addr().to_ip().map(|a| a.port()).ok_or("analyzer server has no TCP address")?;
    let next_id = AtomicU64::new(1);

    let pending = state.pending.clone();
    std::thread::Builder::new()
        .name("miteiru-analyzer".into())
        .spawn(move || {
            for mut request in server.incoming_requests() {
                if !crate::frontend_server::is_local_request(&request, port) {
                    fail(request, 421, "Requests must be addressed to 127.0.0.1 or localhost.");
                    continue;
                }
                let mut body = String::new();
                if request.as_reader().take(MAX_BODY).read_to_string(&mut body).is_err() {
                    fail(request, 400, "Expected a UTF-8 body.");
                    continue;
                }
                let token = request
                    .headers()
                    .iter()
                    .find(|h| h.field.equiv("x-miteiru-analyzer-token"))
                    .map(|h| h.value.as_str().to_string());
                let id = next_id.fetch_add(1, Ordering::Relaxed);
                let payload = AnalyzerRequest {
                    id,
                    method: request.method().as_str().to_string(),
                    path: request.url().to_string(),
                    token,
                    body,
                };
                pending.lock().unwrap().insert(id, (Instant::now(), request));
                if app.emit("analyzer://request", payload).is_err() {
                    if let Some((_, request)) = pending.lock().unwrap().remove(&id) {
                        fail(request, 503, "Miteiru's window is not ready.");
                    }
                }
            }
        })
        .map_err(|e| e.to_string())?;

    let pending = state.pending.clone();
    std::thread::Builder::new()
        .name("miteiru-analyzer-reaper".into())
        .spawn(move || loop {
            std::thread::sleep(Duration::from_secs(5));
            let expired: Vec<tiny_http::Request> = {
                let mut map = pending.lock().unwrap();
                let ids: Vec<u64> =
                    map.iter().filter(|(_, (since, _))| since.elapsed() > ANSWER_TIMEOUT).map(|(id, _)| *id).collect();
                ids.into_iter().filter_map(|id| map.remove(&id)).map(|(_, request)| request).collect()
            };
            for request in expired {
                fail(request, 504, "Miteiru did not answer in time.");
            }
        })
        .map_err(|e| e.to_string())?;

    *port_slot = Some(port);
    Ok(port)
}

/// The worker's answer to request `id`; `body` is the JSON text.
#[tauri::command]
pub async fn analyzer_respond(state: State<'_, Analyzer>, id: u64, status: u16, body: String) -> Result<(), String> {
    let entry = state.pending.lock().unwrap().remove(&id);
    if let Some((_, request)) = entry {
        request.respond(json_response(status, body)).map_err(|e| e.to_string())?;
    }
    Ok(())
}
