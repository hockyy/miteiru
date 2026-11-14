//! `miteiru --mcp`: Miteiru's MCP server for AI assistants, over stdin and stdout (docs/LOCAL_API.md).
//!
//! The handshake and the tool list come from main/mcp/definitions.json, compiled in, so an assistant
//! connects even while Miteiru is closed. Each tool call goes to the running app's local API
//! (`POST /mcp`, answered by main/mcp/protocol.ts), found through analyzer-server.json the way any
//! other client finds it. Nothing but MCP messages may ever be written to stdout.

use std::collections::HashSet;
use std::io::{BufRead, Write};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tauri_plugin_http::reqwest;

const DEFINITIONS: &str = include_str!("../../main/mcp/definitions.json");
const PACKAGE_JSON: &str = include_str!("../../package.json");
const REGISTRATION_FILE: &str = "analyzer-server.json";
const TOKEN_HEADER: &str = "X-Miteiru-Analyzer-Token";
/// A little longer than the app gives its worker to answer (analyzer.rs), so the app's own 504 arrives first.
const CALL_TIMEOUT: Duration = Duration::from_secs(130);
const NOT_OPEN: &str = "Miteiru isn't open. Ask the learner to open it, then try again.";

type Out = Arc<Mutex<std::io::Stdout>>;

/// Answers MCP messages until stdin closes; returns the exit code.
pub fn run() -> i32 {
  let definitions: Value = serde_json::from_str(DEFINITIONS).expect("main/mcp/definitions.json is valid JSON");
  let version = app_version();
  let out: Out = Arc::new(Mutex::new(std::io::stdout()));
  let calls: Arc<Mutex<Calls>> = Arc::default();
  for line in std::io::stdin().lock().split(b'\n') {
    let Ok(line) = line else { break };
    let text = String::from_utf8_lossy(&line);
    let text = text.trim();
    if text.is_empty() {
      continue;
    }
    let message: Value = match serde_json::from_str(text) {
      Ok(message) => message,
      Err(_) => {
        send(&out, &error(Value::Null, -32700, "Parse error"));
        continue;
      }
    };
    match answer_here(&message, &definitions, &version) {
      Here::Reply(reply) => send(&out, &reply),
      Here::Ignore => {
        if let Some(id) = cancelled_request(&message) {
          lock(&calls).cancel(id);
        }
      }
      Here::Forward => {
        // A call can take a minute (a YouTube search); other messages are answered meanwhile.
        let id = message.get("id").map(Value::to_string);
        if let Some(id) = &id {
          lock(&calls).start(id.clone());
        }
        let out = out.clone();
        let calls = calls.clone();
        std::thread::spawn(move || {
          let reply = forward(&message);
          let cancelled = id.is_some_and(|id| lock(&calls).finish(&id));
          if let Some(reply) = reply.filter(|_| !cancelled) {
            send(&out, &reply);
          }
        });
      }
    }
  }
  0
}

/// Calls passed to the app and not answered yet, and which of them the client cancelled: a cancelled
/// call's answer is not sent (the app still finishes it). Ids are JSON text, so 5 and "5" differ.
#[derive(Default)]
struct Calls {
  running: HashSet<String>,
  cancelled: HashSet<String>,
}

impl Calls {
  fn start(&mut self, id: String) {
    self.running.insert(id);
  }

  /// A cancellation counts only for a call still running: one for a call already answered, or never
  /// made, would otherwise wait in the set and silence a later call that reuses the id.
  fn cancel(&mut self, id: String) {
    if self.running.contains(&id) {
      self.cancelled.insert(id);
    }
  }

  /// The call is answered; true if the client cancelled it, so its answer is dropped.
  fn finish(&mut self, id: &str) -> bool {
    self.running.remove(id);
    self.cancelled.remove(id)
  }
}

/// The id a `notifications/cancelled` names, as JSON text, so 5 and "5" stay different ids.
fn cancelled_request(message: &Value) -> Option<String> {
  if message.get("method")?.as_str()? != "notifications/cancelled" {
    return None;
  }
  message.pointer("/params/requestId").map(Value::to_string)
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
  mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn app_version() -> String {
  serde_json::from_str::<Value>(PACKAGE_JSON)
    .ok()
    .and_then(|package| package.get("version").and_then(Value::as_str).map(str::to_owned))
    .unwrap_or_default()
}

#[derive(Debug)]
enum Here {
  Reply(Value),
  /// Responses and notifications get no answer.
  Ignore,
  /// For the running app.
  Forward,
}

fn answer_here(message: &Value, definitions: &Value, version: &str) -> Here {
  if message.is_array() {
    return Here::Forward;
  }
  let Some(method) = message.get("method").and_then(Value::as_str) else {
    return Here::Ignore;
  };
  let Some(id) = message.get("id").cloned() else {
    return Here::Ignore;
  };
  let result = match method {
    "initialize" => initialize(message, definitions, version),
    "ping" => json!({}),
    "tools/list" => json!({"tools": definitions["tools"]}),
    _ => return Here::Forward,
  };
  Here::Reply(json!({"jsonrpc": "2.0", "id": id, "result": result}))
}

/// The same answer main/mcp/protocol.ts gives: the client's protocol version when it is one of ours,
/// else our newest.
fn initialize(message: &Value, definitions: &Value, version: &str) -> Value {
  let supported = definitions["protocolVersions"].as_array().cloned().unwrap_or_default();
  let protocol_version = message
    .pointer("/params/protocolVersion")
    .filter(|asked| supported.contains(asked))
    .or_else(|| supported.first())
    .cloned()
    .unwrap_or(Value::Null);
  json!({
    "protocolVersion": protocol_version,
    "capabilities": {"tools": {"listChanged": false}},
    "serverInfo": {
      "name": definitions["serverInfo"]["name"],
      "title": definitions["serverInfo"]["title"],
      "version": version,
    },
    "instructions": definitions["instructions"],
  })
}

#[derive(Debug, PartialEq)]
struct RunningApp {
  host: String,
  port: u16,
  token: String,
  started_at: u64,
}

fn parse_registration(text: &str) -> Option<RunningApp> {
  let registration: Value = serde_json::from_str(text).ok()?;
  let host = registration.get("host")?.as_str()?;
  // The token never goes anywhere but this computer.
  if !matches!(host, "127.0.0.1" | "localhost") {
    return None;
  }
  Some(RunningApp {
    host: host.to_owned(),
    port: u16::try_from(registration.get("port")?.as_u64()?).ok()?,
    token: registration.get("token")?.as_str()?.to_owned(),
    started_at: registration.get("startedAt").and_then(Value::as_u64).unwrap_or(0),
  })
}

/// Read again for every call: a restarted app listens on a new port with a new token.
fn running_apps() -> Vec<RunningApp> {
  let mut apps: Vec<RunningApp> = crate::sys::info::user_data_dir_candidates()
    .iter()
    .filter_map(|dir| std::fs::read_to_string(dir.join(REGISTRATION_FILE)).ok())
    .filter_map(|text| parse_registration(&text))
    .collect();
  // The newest run first: an older file may be left by an app that has closed since.
  apps.sort_by(|a, b| b.started_at.cmp(&a.started_at));
  apps
}

fn forward(message: &Value) -> Option<Value> {
  let body = message.to_string();
  for app in running_apps() {
    match post(&app, &body) {
      // The answer to a notification.
      Ok((202, _)) => return None,
      Ok((200, reply)) => {
        return match serde_json::from_str(&reply) {
          Ok(reply) => Some(reply),
          Err(_) => failures(message, "Miteiru's answer wasn't JSON."),
        };
      }
      // A stale file whose port a newer Miteiru (a development build beside a release) now uses.
      Ok((401, _)) => continue,
      Ok((status, reply)) => return failures(message, &app_error(status, &reply)),
      // Nothing listens there: an app that has closed. The other build's app may be open.
      Err(_) => continue,
    }
  }
  failures(message, NOT_OPEN)
}

/// The answer when `message` couldn't be answered: one failure per request, in a batch too.
fn failures(message: &Value, text: &str) -> Option<Value> {
  let Some(batch) = message.as_array() else {
    return Some(failure(message, text));
  };
  let answers: Vec<Value> = batch
    .iter()
    .filter(|item| item.get("method").is_some() && item.get("id").is_some())
    .map(|item| failure(item, text))
    .collect();
  (!answers.is_empty()).then(|| Value::Array(answers))
}

fn post(app: &RunningApp, body: &str) -> Result<(u16, String), String> {
  let url = format!("http://{}:{}/mcp", app.host, app.port);
  let token = app.token.clone();
  let body = body.to_owned();
  tauri::async_runtime::block_on(async move {
    // No proxy: a proxy set for the web must not see the token or be asked for 127.0.0.1.
    let client = reqwest::Client::builder()
      .timeout(CALL_TIMEOUT)
      .no_proxy()
      .build()
      .map_err(|e| e.to_string())?;
    let response = client
      .post(&url)
      .header("Content-Type", "application/json")
      .header("Accept", "application/json, text/event-stream")
      .header(TOKEN_HEADER, token)
      .body(body)
      .send()
      .await
      .map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|e| e.to_string())?;
    Ok((status, text))
  })
}

/// The app's own words for a failed request (analyzer.rs and the worker answer `{ok: false, error}`).
fn app_error(status: u16, body: &str) -> String {
  serde_json::from_str::<Value>(body)
    .ok()
    .and_then(|reply| reply.get("error").and_then(Value::as_str).map(str::to_owned))
    .unwrap_or_else(|| format!("Miteiru answered with HTTP {status}."))
}

/// A tool call's failure is its result, so the assistant reads why; other requests get a JSON-RPC error.
fn failure(message: &Value, text: &str) -> Value {
  let id = message.get("id").cloned().unwrap_or(Value::Null);
  if message.get("method").and_then(Value::as_str) == Some("tools/call") {
    json!({"jsonrpc": "2.0", "id": id, "result": {"content": [{"type": "text", "text": text}], "isError": true}})
  } else {
    error(id, -32603, text)
  }
}

fn error(id: Value, code: i64, message: &str) -> Value {
  json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message}})
}

fn send(out: &Out, message: &Value) {
  let mut out = lock(out);
  // One message per line: serde_json writes no raw newline inside one.
  let _ = writeln!(out, "{message}");
  let _ = out.flush();
}

#[cfg(test)]
mod tests {
  use super::*;

  fn definitions() -> Value {
    serde_json::from_str(DEFINITIONS).unwrap()
  }

  fn reply(message: Value) -> Value {
    match answer_here(&message, &definitions(), "9.9.9") {
      Here::Reply(reply) => reply,
      other => panic!("expected a reply, got {other:?}"),
    }
  }

  #[test]
  fn the_definitions_name_every_tool_with_a_schema() {
    let definitions = definitions();
    let tools = definitions["tools"].as_array().unwrap();
    assert!(!tools.is_empty());
    for tool in tools {
      assert!(tool["name"].as_str().is_some_and(|name| !name.is_empty()));
      assert_eq!(tool["inputSchema"]["type"], "object");
    }
    assert!(definitions["protocolVersions"].as_array().is_some_and(|versions| !versions.is_empty()));
  }

  #[test]
  fn initialize_keeps_a_known_protocol_version_and_offers_the_newest_otherwise() {
    let newest = definitions()["protocolVersions"][0].clone();
    let known = reply(json!({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}));
    assert_eq!(known["id"], 1);
    assert_eq!(known["result"]["protocolVersion"], "2025-06-18");
    assert_eq!(known["result"]["serverInfo"]["name"], "miteiru");
    assert_eq!(known["result"]["serverInfo"]["version"], "9.9.9");
    assert_eq!(known["result"]["capabilities"]["tools"]["listChanged"], false);
    let unknown = reply(json!({"jsonrpc": "2.0", "id": "a", "method": "initialize", "params": {"protocolVersion": "1999-01-01"}}));
    assert_eq!(unknown["result"]["protocolVersion"], newest);
  }

  #[test]
  fn ping_and_the_tool_list_are_answered_without_the_app() {
    assert_eq!(reply(json!({"jsonrpc": "2.0", "id": 2, "method": "ping"}))["result"], json!({}));
    let list = reply(json!({"jsonrpc": "2.0", "id": 3, "method": "tools/list"}));
    assert_eq!(list["result"]["tools"], definitions()["tools"]);
  }

  #[test]
  fn notifications_and_responses_get_no_answer_and_calls_go_to_the_app() {
    let defs = definitions();
    let notification = json!({"jsonrpc": "2.0", "method": "notifications/initialized"});
    assert!(matches!(answer_here(&notification, &defs, ""), Here::Ignore));
    let response = json!({"jsonrpc": "2.0", "id": 7, "result": {}});
    assert!(matches!(answer_here(&response, &defs, ""), Here::Ignore));
    let call = json!({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "get_status"}});
    assert!(matches!(answer_here(&call, &defs, ""), Here::Forward));
    assert!(matches!(answer_here(&json!([call]), &defs, ""), Here::Forward));
  }

  #[test]
  fn a_failed_tool_call_is_a_tool_result_and_other_failures_are_errors() {
    let call = json!({"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "get_status"}});
    let failed = failure(&call, NOT_OPEN);
    assert_eq!(failed["id"], 5);
    assert_eq!(failed["result"]["isError"], true);
    assert_eq!(failed["result"]["content"][0]["text"], NOT_OPEN);
    let other = failure(&json!({"jsonrpc": "2.0", "id": 6, "method": "resources/list"}), NOT_OPEN);
    assert_eq!(other["error"]["code"], -32603);
  }

  #[test]
  fn a_batch_gets_one_failure_per_request_and_none_for_notifications() {
    let batch = json!([
      {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "get_status"}},
      {"jsonrpc": "2.0", "method": "notifications/progress"},
      {"jsonrpc": "2.0", "id": 2, "method": "resources/list"}
    ]);
    let answers = failures(&batch, NOT_OPEN).unwrap();
    let answers = answers.as_array().unwrap();
    assert_eq!(answers.len(), 2);
    assert_eq!(answers[0]["id"], 1);
    assert_eq!(answers[0]["result"]["isError"], true);
    assert_eq!(answers[1]["error"]["code"], -32603);
    assert!(failures(&json!([{"jsonrpc": "2.0", "method": "notifications/progress"}]), NOT_OPEN).is_none());
  }

  #[test]
  fn a_cancellation_names_its_request_by_json_value() {
    let cancel = |id: Value| json!({"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {"requestId": id}});
    assert_eq!(cancelled_request(&cancel(json!(5))), Some("5".into()));
    assert_eq!(cancelled_request(&cancel(json!("5"))), Some("\"5\"".into()));
    assert_eq!(cancelled_request(&json!({"jsonrpc": "2.0", "method": "notifications/initialized"})), None);
    // The reply's id is compared the same way.
    let reply = json!({"jsonrpc": "2.0", "id": 5, "result": {}});
    assert_eq!(reply.get("id").map(Value::to_string), Some("5".into()));
  }

  #[test]
  fn only_a_running_call_can_be_cancelled_and_finishing_forgets_it() {
    let mut calls = Calls::default();
    // Cancelled before it ran, or after it was answered: nothing is kept.
    calls.cancel("1".into());
    calls.start("1".into());
    assert!(!calls.finish("1"));
    // Cancelled while it runs: its answer is dropped, once.
    calls.start("2".into());
    calls.cancel("2".into());
    assert!(calls.finish("2"));
    calls.start("2".into());
    assert!(!calls.finish("2"));
    assert!(calls.running.is_empty() && calls.cancelled.is_empty());
  }

  #[test]
  fn registrations_are_read_for_this_computer_only() {
    let app = parse_registration(r#"{"host":"127.0.0.1","port":49183,"token":"t","pid":1,"startedAt":5}"#).unwrap();
    assert_eq!(app, RunningApp {host: "127.0.0.1".into(), port: 49183, token: "t".into(), started_at: 5});
    assert!(parse_registration(r#"{"host":"example.com","port":1,"token":"t"}"#).is_none());
    assert!(parse_registration(r#"{"host":"127.0.0.1","port":70000,"token":"t"}"#).is_none());
    assert!(parse_registration("not json").is_none());
  }

  #[test]
  fn the_app_explains_its_own_failures() {
    assert_eq!(app_error(503, r#"{"ok":false,"error":"Miteiru's window is not ready."}"#), "Miteiru's window is not ready.");
    assert_eq!(app_error(500, "oops"), "Miteiru answered with HTTP 500.");
  }
}
