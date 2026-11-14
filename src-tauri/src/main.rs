// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // `miteiru --mcp` is the MCP server an AI assistant starts (src/mcp_bridge.rs), not the app.
  if std::env::args_os().skip(1).any(|arg| arg == "--mcp") {
    std::process::exit(miteiru_lib::mcp_bridge::run());
  }
  miteiru_lib::run();
}
