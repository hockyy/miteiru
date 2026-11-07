mod analyzer;
mod frontend_server;
mod player;
mod sys;
#[cfg(not(windows))]
mod video_gl;
mod window;

use sys::{dialog, fs, http, info, jieba, kv, proc, shell};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_http::init())
    // Size and position come back as they were (what Electron's window-state store did).
    .plugin(
      tauri_plugin_window_state::Builder::default()
        .with_state_flags(
          tauri_plugin_window_state::StateFlags::SIZE
            | tauri_plugin_window_state::StateFlags::POSITION
            | tauri_plugin_window_state::StateFlags::MAXIMIZED,
        )
        .build(),
    )
    .manage(proc::Procs::default())
    .manage(kv::Kv::default())
    .manage(jieba::JiebaStore::default())
    .manage(player::Players::default())
    .manage(analyzer::Analyzer::default())
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::Destroyed = event {
        player::on_window_destroyed(window.app_handle(), window.label());
      }
    })
    .invoke_handler(tauri::generate_handler![
      info::sys_info,
      info::smoke_test_exit,
      fs::fs_read_text,
      fs::fs_read_bytes,
      fs::fs_write_text,
      fs::fs_write_bytes,
      fs::fs_stat,
      fs::fs_mkdir,
      fs::fs_readdir,
      fs::fs_rm,
      fs::fs_rename,
      fs::fs_copy,
      fs::fs_mkdtemp,
      proc::proc_spawn,
      proc::proc_write,
      proc::proc_end,
      proc::proc_kill,
      proc::proc_which,
      kv::kv_open,
      kv::kv_get,
      kv::kv_get_many,
      kv::kv_put,
      kv::kv_del,
      kv::kv_batch,
      kv::kv_range,
      kv::kv_clear,
      kv::kv_close,
      jieba::jieba_load,
      jieba::jieba_cut,
      http::http_request,
      shell::shell_open_external,
      shell::shell_open_path,
      shell::shell_show_item,
      dialog::dialog_open,
      dialog::dialog_save,
      player::player_open,
      player::player_command,
      player::player_set,
      player::player_get,
      player::player_observe,
      player::player_set_rect,
      player::player_close,
      analyzer::analyzer_start,
      analyzer::analyzer_respond,
    ])
    .setup(|app| {
      window::create_main(app)?;
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
