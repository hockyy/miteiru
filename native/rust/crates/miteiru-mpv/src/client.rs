//! libmpv embedded into a native window through `--wid` (the Tauri shell's player).
//!
//! mpv draws into the window itself with its own renderer (vo=gpu-next), so there is no frame
//! hand-off. The app's webview sits on top with a transparent page where the video shows.
//! Every call made from app threads is non-blocking: commands and property writes are queued with
//! the async libmpv functions, and reads come from a cache the event thread fills.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use crate::mpv::*;
use crate::{Event, EventFn};

/// Where mpv's video goes.
#[derive(Clone, Copy, Debug)]
pub enum VideoOutput {
    /// Draw into this native window with mpv's own renderer (`--wid`; Windows HWND as u32).
    Window(i64),
    /// No window: the app renders frames through [`crate::render::GlRenderer`] (`vo=libmpv`).
    RenderApi,
    /// Audio only.
    None,
}

pub struct ClientOptions {
    pub dll_path: PathBuf,
    pub video: VideoOutput,
    /// Applied after the built-in defaults, so they override them.
    pub mpv_options: Vec<(String, String)>,
}

struct Handle(crate::mpv::Handle);
// SAFETY: the libmpv client API is thread-safe.
unsafe impl Send for Handle {}
unsafe impl Sync for Handle {}

struct Shared {
    mpv: Mpv,
    handle: Handle,
    stop: AtomicBool,
    props: Mutex<HashMap<String, Option<String>>>,
    next_observe_id: AtomicU64,
}

pub struct MpvClient {
    shared: Arc<Shared>,
    event_thread: Mutex<Option<JoinHandle<()>>>,
    destroyed: AtomicBool,
}

impl MpvClient {
    pub fn new(opts: ClientOptions, on_event: EventFn) -> Result<MpvClient, String> {
        let mpv = Mpv::load(&opts.dll_path)?;
        let handle = unsafe { (mpv.create)() };
        if handle.is_null() {
            return Err("mpv_create failed".into());
        }
        // Built-in defaults; a build without some of these features (no Lua, so no `osc`) still starts.
        let mut defaults: Vec<(String, String)> = [
            // Miteiru's UI handles every input and draws its own subtitles and controls.
            ("vo", "gpu-next"),
            ("hwdec", "auto-safe"),
            ("keep-open", "yes"),
            ("idle", "yes"),
            ("terminal", "no"),
            ("osc", "no"),
            ("osd-level", "0"),
            ("input-default-bindings", "no"),
            ("input-vo-keyboard", "no"),
            ("input-cursor", "no"),
            ("cursor-autohide", "no"),
            ("sub-auto", "no"),
            ("msg-level", "all=warn"),
        ]
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
        let mut required: Vec<(String, String)> = Vec::new();
        match opts.video {
            VideoOutput::Window(wid) => required.push(("wid".into(), wid.to_string())),
            VideoOutput::RenderApi => defaults[0] = ("vo".into(), "libmpv".into()),
            VideoOutput::None => required.push(("vid".into(), "no".into())),
        }
        required.extend(opts.mpv_options);
        let init = (|| {
            for (k, v) in &defaults {
                mpv.set_option_if_known(handle, k, v)?;
            }
            for (k, v) in &required {
                mpv.set_option(handle, k, v)?;
            }
            mpv.check(unsafe { (mpv.initialize)(handle) }, "mpv_initialize")?;
            let level = std::ffi::CString::new("warn").unwrap();
            mpv.check(unsafe { (mpv.request_log_messages)(handle, level.as_ptr()) }, "request_log_messages")
        })();
        if let Err(e) = init {
            unsafe { (mpv.terminate_destroy)(handle) };
            return Err(e);
        }
        let shared = Arc::new(Shared {
            mpv,
            handle: Handle(handle),
            stop: AtomicBool::new(false),
            props: Mutex::new(HashMap::new()),
            next_observe_id: AtomicU64::new(1),
        });
        let sh = shared.clone();
        let event_thread = match std::thread::Builder::new()
            .name("miteiru-mpv-events".into())
            .spawn(move || event_loop(sh, on_event))
        {
            Ok(t) => t,
            Err(e) => {
                unsafe { (shared.mpv.terminate_destroy)(handle) };
                return Err(e.to_string());
            }
        };
        Ok(MpvClient { shared, event_thread: Mutex::new(Some(event_thread)), destroyed: AtomicBool::new(false) })
    }

    fn h(&self) -> crate::mpv::Handle {
        self.shared.handle.0
    }

    pub(crate) fn raw(&self) -> crate::mpv::Handle {
        self.shared.handle.0
    }

    pub(crate) fn mpv(&self) -> &Mpv {
        &self.shared.mpv
    }

    fn alive(&self) -> Result<(), String> {
        if self.destroyed.load(Ordering::Acquire) {
            Err("player destroyed".into())
        } else {
            Ok(())
        }
    }

    /// Queue a command. Failures come back as `Event::Log`.
    pub fn command(&self, args: &[String]) -> Result<(), String> {
        self.alive()?;
        self.shared.mpv.command_async(self.h(), args)
    }

    /// Queue a property write. Failures come back as `Event::Log`.
    pub fn set_property(&self, name: &str, value: &str) -> Result<(), String> {
        self.alive()?;
        self.shared.mpv.set_property_async(self.h(), name, value)
    }

    /// Last value mpv reported. The first read of an unobserved property starts observing it.
    pub fn get_property(&self, name: &str) -> Option<String> {
        if self.alive().is_err() {
            return None;
        }
        let mut props = self.shared.props.lock().unwrap();
        if let Some(v) = props.get(name) {
            return v.clone();
        }
        props.insert(name.to_string(), None);
        drop(props);
        let _ = self.observe(&[name.to_string()]);
        None
    }

    pub fn observe(&self, names: &[String]) -> Result<(), String> {
        self.alive()?;
        for n in names {
            let id = self.shared.next_observe_id.fetch_add(1, Ordering::Relaxed);
            self.shared.mpv.observe(self.h(), id, n)?;
        }
        Ok(())
    }

    pub fn destroy(&self) {
        if self.destroyed.swap(true, Ordering::AcqRel) {
            return;
        }
        let sh = &self.shared;
        sh.stop.store(true, Ordering::Release);
        unsafe { (sh.mpv.wakeup)(sh.handle.0) };
        if let Some(t) = self.event_thread.lock().unwrap().take() {
            let _ = t.join();
        }
        unsafe { (sh.mpv.terminate_destroy)(sh.handle.0) };
    }
}

impl Drop for MpvClient {
    fn drop(&mut self) {
        self.destroy();
    }
}

fn event_loop(sh: Arc<Shared>, on_event: EventFn) {
    let mpv = &sh.mpv;
    while !sh.stop.load(Ordering::Acquire) {
        // SAFETY: the event stays valid until the next mpv_wait_event call on this handle.
        let ev = unsafe { &*(mpv.wait_event)(sh.handle.0, 0.25) };
        match ev.event_id {
            MPV_EVENT_NONE => {}
            MPV_EVENT_SHUTDOWN => {
                on_event(Event::Shutdown);
                break;
            }
            MPV_EVENT_PROPERTY_CHANGE => unsafe {
                let p = &*(ev.data as *const MpvEventProperty);
                let name = lossy(p.name);
                let value = if p.format == MPV_FORMAT_STRING && !p.data.is_null() {
                    Some(lossy(*(p.data as *const *const std::ffi::c_char)))
                } else {
                    None
                };
                sh.props.lock().unwrap().insert(name.clone(), value.clone());
                on_event(Event::Property { name, value });
            },
            MPV_EVENT_SET_PROPERTY_REPLY | MPV_EVENT_COMMAND_REPLY if ev.error < 0 => {
                on_event(Event::Log {
                    prefix: "client".into(),
                    level: "error".into(),
                    text: format!("async request failed: {}", mpv.err(ev.error)),
                });
            }
            MPV_EVENT_END_FILE => unsafe {
                let e = &*(ev.data as *const MpvEventEndFile);
                let reason = match e.reason {
                    0 => "eof",
                    2 => "stop",
                    3 => "quit",
                    4 => "error",
                    5 => "redirect",
                    _ => "unknown",
                };
                let error = (e.error < 0).then(|| mpv.err(e.error));
                on_event(Event::EndFile { reason: reason.into(), error });
            },
            MPV_EVENT_LOG_MESSAGE => unsafe {
                let m = &*(ev.data as *const MpvEventLogMessage);
                on_event(Event::Log { prefix: lossy(m.prefix), level: lossy(m.level), text: lossy(m.text) });
            },
            MPV_EVENT_START_FILE => on_event(Event::Notice("start-file")),
            MPV_EVENT_FILE_LOADED => on_event(Event::Notice("file-loaded")),
            MPV_EVENT_VIDEO_RECONFIG => on_event(Event::Notice("video-reconfig")),
            MPV_EVENT_SEEK => on_event(Event::Notice("seek")),
            MPV_EVENT_PLAYBACK_RESTART => on_event(Event::Notice("playback-restart")),
            _ => {}
        }
    }
}
