use serde::Serialize;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SysInfo {
  pub platform: &'static str,
  pub arch: String,
  pub release: String,
  pub version: String,
  pub user_data: String,
  pub temp: String,
  pub home: String,
  pub resources: String,
  pub exe_path: String,
  pub is_packaged: bool,
  pub pid: u32,
  /// MITEIRU_SMOKE_TEST: where the smoke test writes its results (renderer/platform/smokeTest.ts).
  pub smoke_test: Option<String>,
  /// MITEIRU_SMOKE_LANGUAGE_PACKS: a folder of language packs the smoke test installs from files
  /// (renderer/platform/smokeTest.ts).
  pub smoke_language_packs: Option<String>,
  /// Whether this build checks for updates: a release build whose updater has a public key
  /// (`plugins.updater.pubkey` in tauri.conf.json). Test runs (MITEIRU_SMOKE_TEST) never do.
  pub updates: bool,
  /// What an AI assistant starts, with `--mcp`, to reach this app (src/mcp_bridge.rs).
  pub mcp_command: String,
}

pub fn platform() -> &'static str {
  match std::env::consts::OS {
    "windows" => "win32",
    "macos" => "darwin",
    _ => "linux",
  }
}

pub fn arch() -> String {
  match std::env::consts::ARCH {
    "x86_64" => "x64".into(),
    "aarch64" => "arm64".into(),
    "x86" => "ia32".into(),
    other => other.into(),
  }
}

/// `MITEIRU_USER_DATA_DIR`, else `<config_dir>/miteiru` (+ " (development)" in debug builds).
/// MITEIRU_MUTED=1: tests and debugging runs start with mpv and the webview muted.
pub fn start_muted() -> bool {
  std::env::var_os("MITEIRU_MUTED").is_some_and(|v| !v.is_empty() && v != "0")
}

pub fn user_data_dir() -> PathBuf {
  if let Some(dir) = std::env::var_os("MITEIRU_USER_DATA_DIR").filter(|v| !v.is_empty()) {
    return PathBuf::from(dir);
  }
  let base = dirs::config_dir().unwrap_or_else(std::env::temp_dir);
  base.join(if cfg!(debug_assertions) { "miteiru (development)" } else { "miteiru" })
}

/// Where a running Miteiru may keep its data, for clients looking for one (src/mcp_bridge.rs):
/// `MITEIRU_USER_DATA_DIR` alone when it is set, else a release build's folder, then a development build's.
pub fn user_data_dir_candidates() -> Vec<PathBuf> {
  if let Some(dir) = std::env::var_os("MITEIRU_USER_DATA_DIR").filter(|v| !v.is_empty()) {
    return vec![PathBuf::from(dir)];
  }
  let base = dirs::config_dir().unwrap_or_else(std::env::temp_dir);
  vec![base.join("miteiru"), base.join("miteiru (development)")]
}

/// The program an assistant runs as `<it> --mcp`: the AppImage itself when running from one (the
/// executable inside is mounted at a new path on each launch), else this executable.
pub fn mcp_command() -> PathBuf {
  std::env::var_os("APPIMAGE")
    .filter(|v| !v.is_empty())
    .map(PathBuf::from)
    .unwrap_or_else(|| std::env::current_exe().unwrap_or_default())
}

/// Keep window geometry in the scratch profile too. Absolute filenames override the plugin's
/// app-config directory; its default filename keeps existing production window state in place.
pub fn window_state_filename() -> String {
  if std::env::var_os("MITEIRU_USER_DATA_DIR").is_some_and(|dir| !dir.is_empty()) {
    return std::path::absolute(user_data_dir().join(tauri_plugin_window_state::DEFAULT_FILENAME))
      .expect("could not resolve the scratch window-state path")
      .to_string_lossy()
      .into_owned();
  }
  tauri_plugin_window_state::DEFAULT_FILENAME.into()
}

fn run_capture(program: &str, args: &[&str]) -> Option<String> {
  let mut cmd = std::process::Command::new(program);
  cmd.args(args);
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000);
  }
  let out = cmd.output().ok()?;
  out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn os_release() -> String {
  static CACHE: OnceLock<String> = OnceLock::new();
  CACHE
    .get_or_init(|| {
      let found = if cfg!(windows) {
        run_capture("cmd", &["/C", "ver"]).and_then(|s| {
          let start = s.find("Version ")? + 8;
          Some(s[start..].trim_end_matches(']').trim().to_string())
        })
      } else if cfg!(target_os = "linux") {
        std::fs::read_to_string("/proc/sys/kernel/osrelease").ok().map(|s| s.trim().to_string())
      } else {
        run_capture("uname", &["-r"])
      };
      found.unwrap_or_default()
    })
    .clone()
}

fn s(p: PathBuf) -> String {
  p.to_string_lossy().into_owned()
}

#[tauri::command]
pub async fn sys_info(app: tauri::AppHandle) -> Result<SysInfo, String> {
  let user_data = user_data_dir();
  std::fs::create_dir_all(&user_data)
    .map_err(|e| super::fs_err(&e, "mkdir", &s(user_data.clone())))?;
  Ok(SysInfo {
    platform: platform(),
    arch: arch(),
    release: os_release(),
    version: app.package_info().version.to_string(),
    user_data: s(user_data),
    temp: s(std::env::temp_dir()),
    home: s(dirs::home_dir().unwrap_or_default()),
    resources: s(app.path().resource_dir().unwrap_or_default()),
    exe_path: s(std::env::current_exe().unwrap_or_default()),
    is_packaged: !cfg!(debug_assertions),
    pid: std::process::id(),
    smoke_test: std::env::var("MITEIRU_SMOKE_TEST").ok().filter(|p| !p.is_empty()),
    smoke_language_packs: std::env::var("MITEIRU_SMOKE_LANGUAGE_PACKS").ok().filter(|p| !p.is_empty()),
    updates: updates_enabled(&app),
    mcp_command: s(mcp_command()),
  })
}

fn updates_enabled(app: &tauri::AppHandle) -> bool {
  let pubkey = app
    .config()
    .plugins
    .0
    .get("updater")
    .and_then(|updater| updater.get("pubkey"))
    .and_then(|key| key.as_str())
    .unwrap_or("");
  !cfg!(debug_assertions) && !pubkey.trim().is_empty() && std::env::var_os("MITEIRU_SMOKE_TEST").is_none()
}

/// Ends the app with `code`; only in a smoke test run, which has no one to close the window.
#[tauri::command]
pub fn smoke_test_exit(app: tauri::AppHandle, code: i32) -> Result<(), String> {
  if std::env::var_os("MITEIRU_SMOKE_TEST").is_none() {
    return Err("EPERM: smoke_test_exit is only available in a smoke test run".into());
  }
  app.exit(code);
  Ok(())
}
