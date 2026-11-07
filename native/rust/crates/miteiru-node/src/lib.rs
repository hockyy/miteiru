//! Node-API wrapper around `miteiru-player`.
//!
//! ```js
//! const { Player } = require('./miteiru_node.node')
//! const p = new Player({ dllPath, adapter: { vendorId, deviceId } })
//! p.onEvent(e => ...); p.onFrame(f => ...); p.loadFile(path)
//! ```

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use miteiru_player as core;
use napi::bindgen_prelude::*;
use napi::threadsafe_function::{ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi_derive::napi;

#[napi(object)]
pub struct AdapterId {
    pub vendor_id: u32,
    pub device_id: u32,
}

#[napi(object)]
pub struct PlayerOptions {
    pub dll_path: String,
    pub adapter: Option<AdapterId>,
    pub ring_size: Option<u32>,
    pub log_file: Option<String>,
    pub mpv_options: Option<HashMap<String, String>>,
    /// "query" (default) or "keyedmutex".
    pub sync: Option<String>,
    /// Default true: mpv_render_context_render waits for the frame's display time. render.h warns
    /// that turning it off without doing our own frame timing puts A/V sync slightly off.
    pub block_for_target_time: Option<bool>,
}

#[napi(object)]
pub struct PlayerEvent {
    /// "property" | "end-file" | "log" | "shutdown" | "start-file" | "file-loaded" |
    /// "video-reconfig" | "seek" | "playback-restart"
    pub r#type: String,
    pub name: Option<String>,
    pub value: Option<String>,
    pub reason: Option<String>,
    pub error: Option<String>,
    pub level: Option<String>,
    pub prefix: Option<String>,
    pub text: Option<String>,
}

impl PlayerEvent {
    fn bare(kind: &str) -> Self {
        PlayerEvent {
            r#type: kind.to_string(),
            name: None,
            value: None,
            reason: None,
            error: None,
            level: None,
            prefix: None,
            text: None,
        }
    }
}

#[napi(object)]
pub struct FrameInfo {
    /// Opaque token: pass it to `releaseSlot` once the texture is no longer used.
    pub slot: u32,
    pub width: u32,
    pub height: u32,
    /// 8-byte little-endian NT HANDLE value, valid in this process.
    pub nt_handle: Buffer,
    pub timestamp_us: f64,
    pub render_ms: f64,
}

#[napi(object)]
pub struct PlayerStats {
    pub frames: f64,
    pub stalls: f64,
    pub render_errors: f64,
    pub fence_timeouts: f64,
    pub ring_recreations: f64,
    pub avg_render_ms: f64,
    pub max_render_ms: f64,
    pub width: u32,
    pub height: u32,
}

type EventTsfn = ThreadsafeFunction<PlayerEvent, (), PlayerEvent, Status, false, true>;
type FrameTsfn = ThreadsafeFunction<FrameInfo, (), FrameInfo, Status, false, true>;

#[napi]
pub struct Player {
    inner: Arc<core::Player>,
    on_event: Arc<Mutex<Option<EventTsfn>>>,
    on_frame: Arc<Mutex<Option<FrameTsfn>>>,
}

fn err(e: String) -> Error {
    Error::from_reason(e)
}

#[napi]
impl Player {
    #[napi(constructor)]
    pub fn new(options: PlayerOptions) -> Result<Self> {
        let on_event: Arc<Mutex<Option<EventTsfn>>> = Arc::new(Mutex::new(None));
        let on_frame: Arc<Mutex<Option<FrameTsfn>>> = Arc::new(Mutex::new(None));

        let sync = match options.sync.as_deref() {
            None => core::SyncMode::Query,
            Some(s) => core::SyncMode::parse(s).ok_or_else(|| err(format!("unknown sync mode {s:?}")))?,
        };
        let opts = core::Options {
            dll_path: PathBuf::from(options.dll_path),
            adapter: options.adapter.map(|a| (a.vendor_id, a.device_id)),
            ring_size: options.ring_size.unwrap_or(3) as usize,
            log_file: options.log_file.map(PathBuf::from),
            mpv_options: options.mpv_options.unwrap_or_default().into_iter().collect(),
            sync,
            block_for_target_time: options.block_for_target_time.unwrap_or(true),
        };

        let ev_cell = on_event.clone();
        let event_fn: core::EventFn = Arc::new(move |e| {
            let guard = ev_cell.lock().unwrap();
            let Some(tsfn) = guard.as_ref() else { return };
            let mut out = PlayerEvent::bare("property");
            match e {
                core::Event::Property { name, value } => {
                    out.name = Some(name);
                    out.value = value;
                }
                core::Event::EndFile { reason, error } => {
                    out.r#type = "end-file".into();
                    out.reason = Some(reason);
                    out.error = error;
                }
                core::Event::Log { prefix, level, text } => {
                    out.r#type = "log".into();
                    out.prefix = Some(prefix);
                    out.level = Some(level);
                    out.text = Some(text);
                }
                core::Event::Notice(kind) => out.r#type = kind.into(),
                core::Event::Shutdown => out.r#type = "shutdown".into(),
            }
            tsfn.call(out, ThreadsafeFunctionCallMode::NonBlocking);
        });

        let fr_cell = on_frame.clone();
        let frame_fn: core::FrameFn = Arc::new(move |f| {
            let guard = fr_cell.lock().unwrap();
            let Some(tsfn) = guard.as_ref() else { return };
            tsfn.call(
                FrameInfo {
                    slot: f.slot,
                    width: f.width,
                    height: f.height,
                    nt_handle: Buffer::from(f.nt_handle.to_le_bytes().to_vec()),
                    timestamp_us: f.timestamp_us as f64,
                    render_ms: f.render_ms,
                },
                ThreadsafeFunctionCallMode::NonBlocking,
            );
        });

        let inner = core::Player::new(opts, event_fn, frame_fn).map_err(err)?;
        Ok(Player { inner: Arc::new(inner), on_event, on_frame })
    }

    #[napi]
    pub fn on_event(&self, cb: Function<'_, PlayerEvent, ()>) -> Result<()> {
        let tsfn = cb.build_threadsafe_function::<PlayerEvent>().callee_handled::<false>().weak::<true>().build()?;
        *self.on_event.lock().unwrap() = Some(tsfn);
        Ok(())
    }

    #[napi]
    pub fn on_frame(&self, cb: Function<'_, FrameInfo, ()>) -> Result<()> {
        let tsfn = cb.build_threadsafe_function::<FrameInfo>().callee_handled::<false>().weak::<true>().build()?;
        *self.on_frame.lock().unwrap() = Some(tsfn);
        Ok(())
    }

    #[napi]
    pub fn load_file(&self, path: String) -> Result<()> {
        self.inner.load_file(&path).map_err(err)
    }

    #[napi]
    pub fn command(&self, args: Vec<String>) -> Result<()> {
        self.inner.command(&args).map_err(err)
    }

    #[napi]
    pub fn set_property(&self, name: String, value: String) -> Result<()> {
        self.inner.set_property(&name, &value).map_err(err)
    }

    #[napi]
    pub fn get_property(&self, name: String) -> Option<String> {
        self.inner.get_property(&name)
    }

    #[napi]
    pub fn observe(&self, names: Vec<String>) -> Result<()> {
        self.inner.observe(&names).map_err(err)
    }

    #[napi]
    pub fn release_slot(&self, slot: u32) {
        self.inner.release_slot(slot)
    }

    /// Chosen GPU, for logging.
    #[napi]
    pub fn adapter_info(&self) -> String {
        self.inner.gpu_description()
    }

    #[napi]
    pub fn stats(&self) -> PlayerStats {
        let s = self.inner.stats();
        PlayerStats {
            frames: s.frames as f64,
            stalls: s.stalls as f64,
            render_errors: s.render_errors as f64,
            fence_timeouts: s.fence_timeouts as f64,
            ring_recreations: s.ring_recreations as f64,
            avg_render_ms: s.avg_render_ms,
            max_render_ms: s.max_render_ms,
            width: s.width,
            height: s.height,
        }
    }

    /// Returns a Promise: teardown waits (up to 1 s) for JS to release outstanding slots,
    /// so it runs off the JS thread.
    #[napi]
    pub fn destroy(&self) -> AsyncTask<DestroyTask> {
        // Drop the JS callbacks first so no further calls are queued.
        *self.on_event.lock().unwrap() = None;
        *self.on_frame.lock().unwrap() = None;
        AsyncTask::new(DestroyTask { inner: self.inner.clone() })
    }
}

pub struct DestroyTask {
    inner: Arc<core::Player>,
}

impl Task for DestroyTask {
    type Output = ();
    type JsValue = ();

    fn compute(&mut self) -> Result<Self::Output> {
        self.inner.destroy();
        Ok(())
    }

    fn resolve(&mut self, _env: Env, _output: Self::Output) -> Result<Self::JsValue> {
        Ok(())
    }
}
