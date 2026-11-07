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
pub fn user_data_dir() -> PathBuf {
  if let Some(dir) = std::env::var_os("MITEIRU_USER_DATA_DIR").filter(|v| !v.is_empty()) {
    return PathBuf::from(dir);
  }
  let base = dirs::config_dir().unwrap_or_else(std::env::temp_dir);
  base.join(if cfg!(debug_assertions) { "miteiru (development)" } else { "miteiru" })
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
  })
}
