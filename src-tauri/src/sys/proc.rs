use super::io_code;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

#[derive(Debug, Clone, PartialEq)]
pub enum ProcEvent {
  Data { id: u32, stream: &'static str, data: String },
  Exit { id: u32, code: Option<i32>, signal: Option<String> },
}

pub type Emit = Arc<dyn Fn(ProcEvent) + Send + Sync>;

struct Entry {
  pid: u32,
  stdin: Mutex<Option<ChildStdin>>,
  killed: AtomicBool,
}

type Table = Arc<Mutex<HashMap<u32, Arc<Entry>>>>;

#[derive(Default)]
pub struct Procs {
  next: AtomicU32,
  table: Table,
}

pub struct SpawnSpec {
  pub program: String,
  pub args: Vec<String>,
  pub cwd: Option<String>,
  pub env: Option<HashMap<String, String>>,
  pub shell: bool,
}

fn build_command(spec: &SpawnSpec) -> Command {
  let mut cmd;
  if spec.shell {
    let mut line = spec.program.clone();
    for a in &spec.args {
      line.push(' ');
      line.push_str(a);
    }
    #[cfg(windows)]
    {
      use std::os::windows::process::CommandExt;
      cmd = Command::new("cmd");
      cmd.args(["/d", "/s", "/c"]);
      cmd.raw_arg(format!("\"{line}\""));
    }
    #[cfg(not(windows))]
    {
      cmd = Command::new("/bin/sh");
      cmd.arg("-c").arg(line);
    }
  } else {
    cmd = Command::new(&spec.program);
    cmd.args(&spec.args);
  }
  if let Some(cwd) = &spec.cwd {
    cmd.current_dir(cwd);
  }
  if let Some(env) = &spec.env {
    cmd.envs(env);
  }
  cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
  }
  #[cfg(unix)]
  {
    use std::os::unix::process::CommandExt;
    cmd.process_group(0);
  }
  cmd
}

#[cfg(unix)]
fn signal_name(sig: i32) -> String {
  match sig {
    1 => "SIGHUP",
    2 => "SIGINT",
    3 => "SIGQUIT",
    6 => "SIGABRT",
    9 => "SIGKILL",
    11 => "SIGSEGV",
    13 => "SIGPIPE",
    14 => "SIGALRM",
    15 => "SIGTERM",
    _ => return format!("SIG{sig}"),
  }
  .to_string()
}

fn exit_info(status: std::process::ExitStatus, killed: bool) -> (Option<i32>, Option<String>) {
  #[cfg(unix)]
  {
    use std::os::unix::process::ExitStatusExt;
    if let Some(sig) = status.signal() {
      return (None, Some(signal_name(sig)));
    }
  }
  if killed {
    return (None, Some("SIGTERM".into()));
  }
  (status.code(), None)
}

fn pump<R: Read + Send + 'static>(
  mut r: R,
  id: u32,
  stream: &'static str,
  emit: Emit,
) -> std::thread::JoinHandle<()> {
  std::thread::spawn(move || {
    let mut buf = vec![0u8; 64 * 1024];
    loop {
      match r.read(&mut buf) {
        Ok(0) | Err(_) => break,
        Ok(n) => emit(ProcEvent::Data { id, stream, data: STANDARD.encode(&buf[..n]) }),
      }
    }
  })
}

pub fn spawn(procs: &Procs, spec: &SpawnSpec, emit: Emit) -> Result<u32, String> {
  let mut child: Child = build_command(spec)
    .spawn()
    .map_err(|e| format!("{}: spawn {}", io_code(&e), spec.program))?;
  let id = procs.next.fetch_add(1, Ordering::Relaxed) + 1;
  let entry = Arc::new(Entry {
    pid: child.id(),
    stdin: Mutex::new(child.stdin.take()),
    killed: AtomicBool::new(false),
  });
  procs.table.lock().unwrap().insert(id, entry.clone());

  let out = child.stdout.take().map(|s| pump(s, id, "stdout", emit.clone()));
  let err = child.stderr.take().map(|s| pump(s, id, "stderr", emit.clone()));
  let table = procs.table.clone();
  std::thread::spawn(move || {
    let status = child.wait();
    for h in [out, err].into_iter().flatten() {
      let _ = h.join();
    }
    table.lock().unwrap().remove(&id);
    let (code, signal) = match status {
      Ok(s) => exit_info(s, entry.killed.load(Ordering::Relaxed)),
      Err(_) => (None, None),
    };
    emit(ProcEvent::Exit { id, code, signal });
  });
  Ok(id)
}

fn entry(procs: &Procs, id: u32) -> Result<Arc<Entry>, String> {
  procs
    .table
    .lock()
    .unwrap()
    .get(&id)
    .cloned()
    .ok_or_else(|| format!("EINVAL: invalid argument, no such process {id}"))
}

pub fn write(procs: &Procs, id: u32, data: &[u8]) -> Result<(), String> {
  let e = entry(procs, id)?;
  let mut guard = e.stdin.lock().unwrap();
  match guard.as_mut() {
    Some(stdin) => stdin
      .write_all(data)
      .and_then(|_| stdin.flush())
      .map_err(|err| format!("{}: write, process {id}", io_code(&err))),
    None => Err(format!("EPIPE: broken pipe, write, process {id}")),
  }
}

pub fn end(procs: &Procs, id: u32) -> Result<(), String> {
  *entry(procs, id)?.stdin.lock().unwrap() = None;
  Ok(())
}

pub fn kill(procs: &Procs, id: u32) -> Result<(), String> {
  // Already exited (entry removed) is not an error, like Node's child.kill().
  let Ok(e) = entry(procs, id) else { return Ok(()) };
  e.killed.store(true, Ordering::Relaxed);
  kill_tree(e.pid);
  Ok(())
}

#[cfg(windows)]
fn kill_tree(pid: u32) {
  use std::os::windows::process::CommandExt;
  let _ = Command::new("taskkill")
    .args(["/T", "/F", "/PID", &pid.to_string()])
    .creation_flags(0x0800_0000)
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .status();
}

#[cfg(unix)]
fn kill_tree(pid: u32) {
  // The child leads its own process group (see build_command), so -pid reaches its descendants.
  unsafe {
    if libc::kill(-(pid as i32), libc::SIGKILL) != 0 {
      libc::kill(pid as i32, libc::SIGKILL);
    }
  }
}

/// PATH lookup (with PATHEXT on Windows). `path_var`/`pathext` are injected for testing.
pub fn which_in(name: &str, path_var: &std::ffi::OsStr, pathext: Option<&str>) -> Option<PathBuf> {
  if name.is_empty() {
    return None;
  }
  let exts: Vec<String> = match pathext {
    Some(p) => p.split(';').filter(|s| !s.is_empty()).map(|s| s.to_ascii_lowercase()).collect(),
    None => Vec::new(),
  };
  let candidates = |base: &Path| -> Vec<PathBuf> {
    let mut v = Vec::new();
    let lower = base.to_string_lossy().to_ascii_lowercase();
    if exts.is_empty() || exts.iter().any(|e| lower.ends_with(e.as_str())) {
      v.push(base.to_path_buf());
    }
    for e in &exts {
      let mut s = base.as_os_str().to_owned();
      s.push(e);
      v.push(PathBuf::from(s));
    }
    v
  };
  let is_exec = |p: &Path| -> bool {
    let Ok(m) = std::fs::metadata(p) else { return false };
    if !m.is_file() {
      return false;
    }
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      m.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
      true
    }
  };
  if name.contains('/') || name.contains('\\') {
    return candidates(Path::new(name)).into_iter().find(|p| is_exec(p));
  }
  for dir in std::env::split_paths(path_var) {
    let dir = PathBuf::from(dir.to_string_lossy().trim_matches('"'));
    if let Some(p) = candidates(&dir.join(name)).into_iter().find(|p| is_exec(p)) {
      return Some(p);
    }
  }
  None
}

pub fn which(name: &str) -> Option<String> {
  let path = std::env::var_os("PATH").unwrap_or_default();
  let pathext = if cfg!(windows) {
    Some(std::env::var("PATHEXT").unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".into()))
  } else {
    None
  };
  which_in(name, &path, pathext.as_deref()).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn proc_spawn(
  app: tauri::AppHandle,
  procs: tauri::State<'_, Procs>,
  program: String,
  args: Option<Vec<String>>,
  cwd: Option<String>,
  env: Option<HashMap<String, String>>,
  shell: Option<bool>,
) -> Result<u32, String> {
  let emit: Emit = Arc::new(move |ev| match ev {
    ProcEvent::Data { id, stream, data } => {
      let _ = app.emit("proc://data", serde_json::json!({ "id": id, "stream": stream, "data": data }));
    }
    ProcEvent::Exit { id, code, signal } => {
      let _ = app.emit("proc://exit", serde_json::json!({ "id": id, "code": code, "signal": signal }));
    }
  });
  let spec = SpawnSpec {
    program,
    args: args.unwrap_or_default(),
    cwd,
    env,
    shell: shell.unwrap_or(false),
  };
  spawn(&procs, &spec, emit)
}

#[tauri::command]
pub async fn proc_write(procs: tauri::State<'_, Procs>, id: u32, data: String) -> Result<(), String> {
  let bytes = STANDARD.decode(data).map_err(|e| format!("EINVAL: invalid argument, base64: {e}"))?;
  write(&procs, id, &bytes)
}

#[tauri::command]
pub async fn proc_end(procs: tauri::State<'_, Procs>, id: u32) -> Result<(), String> {
  end(&procs, id)
}

#[tauri::command]
pub async fn proc_kill(procs: tauri::State<'_, Procs>, id: u32) -> Result<(), String> {
  kill(&procs, id)
}

#[tauri::command]
pub async fn proc_which(name: String) -> Result<Option<String>, String> {
  Ok(which(&name))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::mpsc;
  use std::time::Duration;

  fn collect(procs: &Procs, spec: SpawnSpec) -> (Vec<u8>, ProcEvent) {
    let (tx, rx) = mpsc::channel();
    let tx = Mutex::new(tx);
    let emit: Emit = Arc::new(move |ev| {
      let _ = tx.lock().unwrap().send(ev);
    });
    spawn(procs, &spec, emit).unwrap();
    let mut out = Vec::new();
    loop {
      match rx.recv_timeout(Duration::from_secs(20)).expect("process timed out") {
        ProcEvent::Data { stream: "stdout", data, .. } => out.extend(STANDARD.decode(data).unwrap()),
        ProcEvent::Data { .. } => {}
        exit @ ProcEvent::Exit { .. } => return (out, exit),
      }
    }
  }

  #[test]
  fn which_finds_shell() {
    let name = if cfg!(windows) { "cmd" } else { "sh" };
    let found = which(name).expect("shell on PATH");
    assert!(Path::new(&found).is_file(), "{found}");
    assert!(which("definitely-not-a-real-binary-xyz").is_none());
  }

  #[test]
  fn shell_echo_and_exit_code() {
    let procs = Procs::default();
    let (out, exit) = collect(
      &procs,
      SpawnSpec { program: "echo hello".into(), args: vec![], cwd: None, env: None, shell: true },
    );
    assert_eq!(String::from_utf8_lossy(&out).trim(), "hello");
    assert_eq!(exit, ProcEvent::Exit { id: 1, code: Some(0), signal: None });
    assert!(procs.table.lock().unwrap().is_empty());
  }

  #[test]
  fn spawn_missing_program_is_enoent() {
    let procs = Procs::default();
    let emit: Emit = Arc::new(|_| {});
    let spec = SpawnSpec {
      program: "definitely-not-a-real-binary-xyz".into(),
      args: vec![],
      cwd: None,
      env: None,
      shell: false,
    };
    assert_eq!(spawn(&procs, &spec, emit).unwrap_err(), "ENOENT: spawn definitely-not-a-real-binary-xyz");
  }

  #[test]
  fn kill_stops_long_running_process() {
    let procs = Procs::default();
    let (tx, rx) = mpsc::channel();
    let tx = Mutex::new(tx);
    let emit: Emit = Arc::new(move |ev| {
      let _ = tx.lock().unwrap().send(ev);
    });
    let line = if cfg!(windows) { "ping -n 30 127.0.0.1" } else { "sleep 30" };
    let id = spawn(
      &procs,
      &SpawnSpec { program: line.into(), args: vec![], cwd: None, env: None, shell: true },
      emit,
    )
    .unwrap();
    std::thread::sleep(Duration::from_millis(500));
    kill(&procs, id).unwrap();
    loop {
      if let ProcEvent::Exit { code, signal, .. } = rx.recv_timeout(Duration::from_secs(15)).expect("no exit") {
        assert_eq!(code, None);
        assert!(signal.is_some());
        break;
      }
    }
  }
}
