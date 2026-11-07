use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tauri_plugin_http::reqwest;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
  pub url: String,
  pub method: Option<String>,
  pub headers: Option<HashMap<String, String>>,
  pub body: Option<String>,
  pub body_base64: Option<String>,
  pub timeout_ms: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
  pub status: u16,
  pub status_text: String,
  pub headers: HashMap<String, String>,
  pub body_base64: String,
}

#[tauri::command]
pub async fn http_request(request: HttpRequest) -> Result<HttpResponse, String> {
  let method = reqwest::Method::from_bytes(
    request.method.as_deref().unwrap_or("GET").to_ascii_uppercase().as_bytes(),
  )
  .map_err(|e| format!("EINVAL: invalid argument, http method: {e}"))?;
  let mut builder = reqwest::Client::builder().redirect(reqwest::redirect::Policy::limited(10));
  if let Some(ms) = request.timeout_ms.filter(|ms| *ms > 0) {
    builder = builder.timeout(Duration::from_millis(ms));
  }
  let client = builder.build().map_err(|e| format!("EIO: i/o error, http client: {e}"))?;
  let mut req = client.request(method, &request.url);
  for (k, v) in request.headers.unwrap_or_default() {
    req = req.header(k, v);
  }
  if let Some(b64) = request.body_base64 {
    req = req.body(
      STANDARD.decode(b64).map_err(|e| format!("EINVAL: invalid argument, base64 body: {e}"))?,
    );
  } else if let Some(body) = request.body {
    req = req.body(body);
  }
  let res = req.send().await.map_err(|e| {
    let code = if e.is_timeout() {
      "ETIMEDOUT"
    } else if e.is_connect() {
      "ECONNREFUSED"
    } else {
      "EIO"
    };
    format!("{code}: http request to '{}' failed: {e}", request.url)
  })?;
  let status = res.status();
  let mut headers: HashMap<String, String> = HashMap::new();
  for (name, value) in res.headers() {
    let value = String::from_utf8_lossy(value.as_bytes()).into_owned();
    headers
      .entry(name.as_str().to_string())
      .and_modify(|old| {
        old.push_str(", ");
        old.push_str(&value);
      })
      .or_insert(value);
  }
  let bytes = res
    .bytes()
    .await
    .map_err(|e| format!("EIO: i/o error, reading http body from '{}': {e}", request.url))?;
  Ok(HttpResponse {
    status: status.as_u16(),
    status_text: status.canonical_reason().unwrap_or("").to_string(),
    headers,
    body_base64: STANDARD.encode(bytes),
  })
}
