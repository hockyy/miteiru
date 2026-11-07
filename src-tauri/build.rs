/// The commands the frontend may call; permissions/app-commands.toml grants them (capabilities/).
const COMMANDS: &[&str] = &[
    "sys_info",
    "drop_paths_take",
    "smoke_test_exit",
    "fs_read_text",
    "fs_read_bytes",
    "fs_read_range",
    "zstd_decompress",
    "table_open",
    "table_close",
    "table_get_many",
    "table_values",
    "fs_write_text",
    "fs_write_bytes",
    "fs_stat",
    "fs_mkdir",
    "fs_readdir",
    "fs_rm",
    "fs_rename",
    "fs_copy",
    "fs_mkdtemp",
    "proc_spawn",
    "proc_write",
    "proc_end",
    "proc_kill",
    "proc_which",
    "kv_open",
    "kv_get",
    "kv_get_many",
    "kv_put",
    "kv_del",
    "kv_batch",
    "kv_bulk",
    "kv_import_dictionary",
    "kv_range",
    "kv_clear",
    "kv_close",
    "jieba_load",
    "jieba_cut",
    "http_request",
    "shell_open_external",
    "shell_open_path",
    "shell_show_item",
    "dialog_open",
    "dialog_save",
    "player_open",
    "player_command",
    "player_set",
    "player_get",
    "player_observe",
    "player_set_rect",
    "player_close",
    "analyzer_start",
    "analyzer_respond",
];

fn main() {
    // macOS: the video surface for libmpv's render API is a small Objective-C view.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=native/macos_video.m");
        println!("cargo:rerun-if-changed=native/macos_drop.m");
        cc::Build::new()
            .file("native/macos_video.m")
            .file("native/macos_drop.m")
            .flag("-fobjc-arc")
            // CAOpenGLLayer and OpenGL are deprecated on macOS but remain the way to host mpv's GL output.
            .flag("-Wno-deprecated-declarations")
            .compile("miteiru_macos_video");
        for framework in ["Cocoa", "QuartzCore", "OpenGL"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("tauri-build failed");
}
