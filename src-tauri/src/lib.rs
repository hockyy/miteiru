mod analyzer;
#[cfg(target_os = "macos")]
mod macos_drop;
#[cfg(windows)]
mod webview2;
mod frontend_server;
mod player;
mod sys;
#[cfg(not(windows))]
mod video_gl;
mod window;

use sys::{dialog, dict_import, fs, http, info, jieba, kv, proc, shell};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    // Size and position come back as they were (what Electron's window-state store did).
    .plugin(
      tauri_plugin_window_state::Builder::default()
        .with_filename(info::window_state_filename())
        .with_state_flags(
          tauri_plugin_window_state::StateFlags::SIZE
            | tauri_plugin_window_state::StateFlags::POSITION
            | tauri_plugin_window_state::StateFlags::MAXIMIZED,
        )
        .build(),
    )
    // In-app updates from GitHub Releases (renderer/platform/updates.ts); process restarts after one.
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .manage(proc::Procs::default())
    .manage(kv::Kv::default())
    .manage(sys::table::Tables::default())
    .manage(jieba::JiebaStore::default())
    .manage(sys::japanese::JapaneseStore::default())
    .manage(player::Players::default())
    .manage(analyzer::Analyzer::default())
    .manage(sys::langpack::Installs::default())
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::Destroyed = event {
        player::on_window_destroyed(window.app_handle(), window.label());
        #[cfg(target_os = "macos")]
        macos_drop::forget(window.label());
      }
    })
    .invoke_handler(tauri::generate_handler![
      info::sys_info,
      #[cfg(target_os = "macos")]
      macos_drop::drop_paths_take,
      info::smoke_test_exit,
      fs::fs_read_text,
      fs::fs_read_bytes,
      fs::fs_read_range,
      fs::fs_read_asset,
      sys::zstd::zstd_decompress,
      sys::table::table_open,
      sys::table::table_close,
      sys::table::table_get_many,
      sys::table::table_values,
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
      kv::kv_bulk,
      dict_import::kv_import_dictionary,
      kv::kv_range,
      kv::kv_clear,
      kv::kv_close,
      jieba::jieba_load,
      jieba::jieba_cut,
      jieba::jieba_user_words,
      sys::japanese::japanese_load,
      sys::japanese::japanese_set_words,
      sys::japanese::japanese_tokenize,
      sys::japanese::japanese_tokenize_batch,
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
      sys::mkv::mkv_tracks,
      sys::mkv::mkv_extract_subtitle,
      sys::langpack::langpack_status,
      sys::langpack::langpack_install,
      sys::langpack::langpack_install_file,
      sys::langpack::langpack_cancel,
      sys::langpack::langpack_remove,
    ])
    // A reload (F5, Ctrl+R) starts a new backend worker that knows nothing of the old one's children
    // (the live-captions helper, yt-dlp), so they are stopped as the new page starts loading. The first
    // load has none yet.
    .on_page_load(|webview, payload| {
      if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
        if let Some(procs) = webview.try_state::<proc::Procs>() {
          proc::kill_all(&procs);
        }
      }
    })
    .setup(|app| {
      // First, so what happens while the window is made (frontend_server.rs, window.rs) is logged.
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Language packs an interrupted install or an older version left behind; never blocks the window.
      if let Ok(root) = sys::langpack::root_dir(app.handle()) {
        std::thread::spawn(move || {
          for line in sys::langpack::collect_garbage(&root) {
            log::info!("langpack cleanup: {line}");
          }
        });
      }
      window::create_main(app)?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
