//! libmpv rendered into a ring of shared D3D11 textures.
//!
//! Threads:
//! * render thread: owns every `mpv_render_*` call and all immediate-context use;
//! * event thread: forwards mpv events;
//! * callers (any thread): `load`, `command`, properties, `release_slot`.

mod d3d;
mod mpv;

pub use d3d::SyncMode;

use std::ffi::c_void;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Condvar, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use d3d::{create_gpu, GpuFence, Ring};
use mpv::*;
use windows::core::Interface;

const MAX_W: u32 = 3840;
const MAX_H: u32 = 2160;
const SLOT_WAIT: Duration = Duration::from_millis(100);
const DRAIN_WAIT: Duration = Duration::from_secs(1);
const MPV_RENDER_PARAM_SKIP_RENDERING: i32 = 13;
const MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME: i32 = 12;
const PROP_DWIDTH: u64 = 1;
const PROP_DHEIGHT: u64 = 2;
const USER_PROP_BASE: u64 = 100;

#[derive(Clone, Debug)]
pub struct Options {
    pub dll_path: PathBuf,
    /// (vendorId, deviceId) of the GPU to create the device on.
    pub adapter: Option<(u32, u32)>,
    pub ring_size: usize,
    pub log_file: Option<PathBuf>,
    /// Applied after the built-in defaults, so they override them.
    pub mpv_options: Vec<(String, String)>,
    pub sync: SyncMode,
    /// Let mpv_render_context_render sleep until the frame's target display time.
    pub block_for_target_time: bool,
}

#[derive(Clone, Debug)]
pub enum Event {
    Property { name: String, value: Option<String> },
    EndFile { reason: String, error: Option<String> },
    Log { prefix: String, level: String, text: String },
    Notice(&'static str),
    Shutdown,
}

#[derive(Clone, Debug)]
pub struct Frame {
    /// Opaque token to pass back to [`Player::release_slot`].
    pub slot: u32,
    pub width: u32,
    pub height: u32,
    /// NT HANDLE value, valid in this process.
    pub nt_handle: u64,
    pub timestamp_us: u64,
    pub render_ms: f64,
}

#[derive(Clone, Debug, Default)]
pub struct Stats {
    pub frames: u64,
    pub stalls: u64,
    pub render_errors: u64,
    pub fence_timeouts: u64,
    pub ring_recreations: u64,
    pub avg_render_ms: f64,
    pub max_render_ms: f64,
    pub width: u32,
    pub height: u32,
}

pub type EventFn = Arc<dyn Fn(Event) + Send + Sync>;
pub type FrameFn = Arc<dyn Fn(Frame) + Send + Sync>;

struct MpvHandle(Handle);
// SAFETY: the libmpv client API is thread-safe.
unsafe impl Send for MpvHandle {}
unsafe impl Sync for MpvHandle {}

struct Wake {
    flag: Mutex<bool>,
    cv: Condvar,
}

impl Wake {
    fn notify(&self) {
        *self.flag.lock().unwrap() = true;
        self.cv.notify_all();
    }
}

unsafe extern "C" fn update_callback(ctx: *mut c_void) {
    // Only signals; never calls into mpv from mpv's own thread.
    (*(ctx as *const Wake)).notify();
}

struct Logger {
    file: Mutex<Option<std::fs::File>>,
    start: Instant,
}

impl Logger {
    fn line(&self, msg: &str) {
        if let Some(f) = self.file.lock().unwrap().as_mut() {
            let _ = writeln!(f, "[{:9.3}] {msg}", self.start.elapsed().as_secs_f64());
        }
    }
}

#[derive(Default)]
struct Counters {
    frames: AtomicU64,
    stalls: AtomicU64,
    render_errors: AtomicU64,
    fence_timeouts: AtomicU64,
    ring_recreations: AtomicU64,
    render_us_total: AtomicU64,
    render_us_max: AtomicU64,
    width: AtomicU32,
    height: AtomicU32,
}

struct Shared {
    mpv: Mpv,
    handle: MpvHandle,
    log: Logger,
    stop: AtomicBool,
    wake: Arc<Wake>,
    ring: Mutex<Option<Ring>>,
    ring_cv: Condvar,
    /// Display size reported by mpv; 0 until known.
    want_w: AtomicU32,
    want_h: AtomicU32,
    redraw: AtomicBool,
    next_observe_id: AtomicU64,
    counters: Counters,
    ring_size: usize,
    sync: SyncMode,
    block: bool,
    gpu_description: String,
}

pub struct Player {
    shared: Arc<Shared>,
    render_thread: Mutex<Option<JoinHandle<()>>>,
    event_thread: Mutex<Option<JoinHandle<()>>>,
    destroyed: AtomicBool,
}

impl Player {
    pub fn new(opts: Options, on_event: EventFn, on_frame: FrameFn) -> Result<Player, String> {
        let start = Instant::now();
        let log_file = opts
            .log_file
            .as_ref()
            .and_then(|p| OpenOptions::new().create(true).append(true).open(p).ok());
        let log = Logger { file: Mutex::new(log_file), start };
        let say = |m: String| log.line(&m);

        let mpv = Mpv::load(&opts.dll_path)?;
        let ver = unsafe { (mpv.api_version)() };
        say(format!("libmpv client api {}.{}", ver >> 16, ver & 0xffff));

        let gpu = create_gpu(opts.adapter, &say)?;
        let gpu_description = gpu.description.clone();

        let handle = unsafe { (mpv.create)() };
        if handle.is_null() {
            return Err("mpv_create failed".into());
        }
        let defaults = [
            ("vo", "libmpv"),
            ("hwdec", "auto-safe"),
            ("keep-open", "yes"),
            ("terminal", "no"),
            ("input-default-bindings", "no"),
            ("osd-level", "0"),
            ("sub-auto", "no"),
            ("msg-level", "all=warn"),
        ];
        let mut all: Vec<(String, String)> =
            defaults.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        all.extend(opts.mpv_options.iter().cloned());
        let init = (|| {
            for (k, v) in &all {
                mpv.set_option(handle, k, v)?;
            }
            mpv.check(unsafe { (mpv.initialize)(handle) }, "mpv_initialize")?;
            mpv.observe(handle, PROP_DWIDTH, "dwidth")?;
            mpv.observe(handle, PROP_DHEIGHT, "dheight")?;
            let level = std::ffi::CString::new("warn").unwrap();
            mpv.check(unsafe { (mpv.request_log_messages)(handle, level.as_ptr()) }, "request_log_messages")
        })();
        if let Err(e) = init {
            unsafe { (mpv.terminate_destroy)(handle) };
            return Err(e);
        }
        say("mpv initialised".to_string());

        let ring_size = opts.ring_size.clamp(2, 8);
        let shared = Arc::new(Shared {
            mpv,
            handle: MpvHandle(handle),
            log,
            stop: AtomicBool::new(false),
            wake: Arc::new(Wake { flag: Mutex::new(false), cv: Condvar::new() }),
            ring: Mutex::new(None),
            ring_cv: Condvar::new(),
            want_w: AtomicU32::new(0),
            want_h: AtomicU32::new(0),
            redraw: AtomicBool::new(false),
            next_observe_id: AtomicU64::new(USER_PROP_BASE),
            counters: Counters::default(),
            ring_size,
            sync: opts.sync,
            block: opts.block_for_target_time,
            gpu_description,
        });

        let (tx, rx) = mpsc::channel::<Result<(), String>>();
        let render_thread = {
            let sh = shared.clone();
            std::thread::Builder::new()
                .name("miteiru-render".into())
                .spawn(move || render_thread(sh, gpu, on_frame, tx))
                .map_err(|e| e.to_string())?
        };
        match rx.recv_timeout(Duration::from_secs(10)) {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                let _ = render_thread.join();
                unsafe { (shared.mpv.terminate_destroy)(handle) };
                return Err(e);
            }
            Err(_) => return Err("render thread did not start".into()),
        }
        let event_thread = {
            let sh = shared.clone();
            std::thread::Builder::new()
                .name("miteiru-events".into())
                .spawn(move || event_thread(sh, on_event))
                .map_err(|e| e.to_string())?
        };
        Ok(Player {
            shared,
            render_thread: Mutex::new(Some(render_thread)),
            event_thread: Mutex::new(Some(event_thread)),
            destroyed: AtomicBool::new(false),
        })
    }

    fn h(&self) -> Handle {
        self.shared.handle.0
    }

    pub fn gpu_description(&self) -> String {
        self.shared.gpu_description.clone()
    }

    pub fn sync_mode(&self) -> SyncMode {
        self.shared.sync
    }

    pub fn load_file(&self, path: &str) -> Result<(), String> {
        self.command(&["loadfile".to_string(), path.to_string(), "replace".to_string()])
    }

    pub fn command(&self, args: &[String]) -> Result<(), String> {
        self.alive()?;
        self.shared.mpv.command(self.h(), args)
    }

    pub fn set_property(&self, name: &str, value: &str) -> Result<(), String> {
        self.alive()?;
        self.shared.mpv.set_property(self.h(), name, value)
    }

    pub fn get_property(&self, name: &str) -> Option<String> {
        if self.alive().is_err() {
            return None;
        }
        self.shared.mpv.get_property(self.h(), name)
    }

    pub fn observe(&self, names: &[String]) -> Result<(), String> {
        self.alive()?;
        for n in names {
            let id = self.shared.next_observe_id.fetch_add(1, Ordering::Relaxed);
            self.shared.mpv.observe(self.h(), id, n)?;
        }
        Ok(())
    }

    fn alive(&self) -> Result<(), String> {
        if self.destroyed.load(Ordering::Acquire) {
            Err("player destroyed".into())
        } else {
            Ok(())
        }
    }

    /// Return a slot to the ring. Tokens from an older ring generation are ignored.
    pub fn release_slot(&self, token: u32) {
        let mut guard = self.shared.ring.lock().unwrap();
        if let Some(ring) = guard.as_mut() {
            if token >> 8 == ring.generation {
                if let Some(s) = ring.slots.get_mut((token & 0xff) as usize) {
                    s.busy = false;
                }
            }
        }
        drop(guard);
        self.shared.ring_cv.notify_all();
    }

    pub fn stats(&self) -> Stats {
        let c = &self.shared.counters;
        let frames = c.frames.load(Ordering::Relaxed);
        Stats {
            frames,
            stalls: c.stalls.load(Ordering::Relaxed),
            render_errors: c.render_errors.load(Ordering::Relaxed),
            fence_timeouts: c.fence_timeouts.load(Ordering::Relaxed),
            ring_recreations: c.ring_recreations.load(Ordering::Relaxed),
            avg_render_ms: if frames > 0 {
                c.render_us_total.load(Ordering::Relaxed) as f64 / frames as f64 / 1000.0
            } else {
                0.0
            },
            max_render_ms: c.render_us_max.load(Ordering::Relaxed) as f64 / 1000.0,
            width: c.width.load(Ordering::Relaxed),
            height: c.height.load(Ordering::Relaxed),
        }
    }

    /// Tear everything down. Blocks up to ~1 s waiting for outstanding slots; call it from
    /// a thread that is not the one that must deliver the slot releases.
    pub fn destroy(&self) {
        if self.destroyed.swap(true, Ordering::AcqRel) {
            return;
        }
        let sh = &self.shared;
        sh.log.line("destroy: begin");
        sh.stop.store(true, Ordering::Release);
        sh.wake.notify();
        sh.ring_cv.notify_all();
        unsafe { (sh.mpv.wakeup)(self.h()) };
        // The render thread frees the render context on its way out (before mpv is destroyed).
        if let Some(t) = self.render_thread.lock().unwrap().take() {
            let _ = t.join();
        }
        if let Some(t) = self.event_thread.lock().unwrap().take() {
            let _ = t.join();
        }
        // Textures are freed only after JS released its slots, or after 1 s.
        {
            let deadline = Instant::now() + DRAIN_WAIT;
            let mut guard = sh.ring.lock().unwrap();
            while guard.as_ref().is_some_and(|r| !r.all_idle()) {
                let now = Instant::now();
                if now >= deadline {
                    sh.log.line("destroy: slots still busy after 1 s, freeing anyway");
                    break;
                }
                guard = sh.ring_cv.wait_timeout(guard, deadline - now).unwrap().0;
            }
            *guard = None;
        }
        unsafe { (sh.mpv.terminate_destroy)(self.h()) };
        sh.log.line("destroy: done");
    }
}

impl Drop for Player {
    fn drop(&mut self) {
        self.destroy();
    }
}

/// Ring size for the current video. Uses only the observed dwidth/dheight: render.h forbids
/// calling non-render libmpv functions (like mpv_get_property) on the render thread.
fn target_size(sh: &Shared) -> (u32, u32) {
    let (mut w, mut h) = (sh.want_w.load(Ordering::Relaxed), sh.want_h.load(Ordering::Relaxed));
    if w == 0 || h == 0 {
        return (1280, 720);
    }
    if w > MAX_W || h > MAX_H {
        let scale = (MAX_W as f64 / w as f64).min(MAX_H as f64 / h as f64);
        w = (w as f64 * scale) as u32;
        h = (h as f64 * scale) as u32;
    }
    (w.max(2) & !1, h.max(2) & !1)
}

fn render_thread(sh: Arc<Shared>, gpu: d3d::Gpu, on_frame: FrameFn, ready: mpsc::Sender<Result<(), String>>) {
    let mpv = &sh.mpv;
    let fence = match GpuFence::new(&gpu.device) {
        Ok(f) => f,
        Err(e) => {
            let _ = ready.send(Err(e));
            return;
        }
    };

    let mut init = MpvD3d11InitParams { device: gpu.device.as_raw() };
    let mut params = [
        MpvRenderParam { type_: MPV_RENDER_PARAM_API_TYPE, data: MPV_RENDER_API_TYPE_D3D11.as_ptr() as *mut c_void },
        MpvRenderParam { type_: MPV_RENDER_PARAM_D3D11_INIT_PARAMS, data: &mut init as *mut _ as *mut c_void },
        MpvRenderParam { type_: 0, data: std::ptr::null_mut() },
    ];
    let mut ctx: RenderContext = std::ptr::null_mut();
    let rc = unsafe { (mpv.render_context_create)(&mut ctx, sh.handle.0, params.as_mut_ptr()) };
    if let Err(e) = mpv.check(rc, "mpv_render_context_create") {
        let _ = ready.send(Err(e));
        return;
    }
    let wake_ptr = Arc::into_raw(sh.wake.clone());
    unsafe { (mpv.render_context_set_update_callback)(ctx, Some(update_callback), wake_ptr as *mut c_void) };
    sh.log.line("render context created (d3d11)");
    let _ = ready.send(Ok(()));

    let epoch = Instant::now();
    let mut generation: u32 = 0;
    while !sh.stop.load(Ordering::Acquire) {
        {
            let mut flag = sh.wake.flag.lock().unwrap();
            if !*flag {
                flag = sh.wake.cv.wait_timeout(flag, Duration::from_millis(250)).unwrap().0;
            }
            *flag = false;
        }
        if sh.stop.load(Ordering::Acquire) {
            break;
        }
        let flags = unsafe { (mpv.render_context_update)(ctx) };
        let redraw = sh.redraw.swap(false, Ordering::AcqRel);
        if flags & MPV_RENDER_UPDATE_FRAME == 0 && !redraw {
            continue;
        }

        // Make sure the ring matches the current display size.
        let (w, h) = target_size(&sh);
        let needs_ring = sh.ring.lock().unwrap().as_ref().map_or(true, |r| (r.width, r.height) != (w, h));
        if needs_ring {
            let deadline = Instant::now() + DRAIN_WAIT;
            let mut guard = sh.ring.lock().unwrap();
            while guard.as_ref().is_some_and(|r| !r.all_idle()) {
                let now = Instant::now();
                if now >= deadline {
                    sh.log.line("ring resize: old slots still busy after 1 s");
                    break;
                }
                guard = sh.ring_cv.wait_timeout(guard, deadline - now).unwrap().0;
            }
            generation = generation.wrapping_add(1) & 0xff_ffff;
            *guard = None; // closes the old handles
            match Ring::new(&gpu.device, w, h, sh.ring_size, sh.sync, generation) {
                Ok(r) => {
                    sh.log.line(&format!("ring created: {w}x{h} x{} gen {generation} sync={:?}", sh.ring_size, sh.sync));
                    sh.counters.ring_recreations.fetch_add(1, Ordering::Relaxed);
                    sh.counters.width.store(w, Ordering::Relaxed);
                    sh.counters.height.store(h, Ordering::Relaxed);
                    *guard = Some(r);
                }
                Err(e) => {
                    sh.log.line(&format!("ring creation failed: {e}"));
                    sh.counters.render_errors.fetch_add(1, Ordering::Relaxed);
                    continue;
                }
            }
        }

        // Take a free slot (wait up to 100 ms).
        let picked = {
            let deadline = Instant::now() + SLOT_WAIT;
            let mut guard = sh.ring.lock().unwrap();
            loop {
                let ring = guard.as_mut().unwrap();
                let n = ring.slots.len();
                let found = (0..n).map(|k| (ring.next + k) % n).find(|&i| !ring.slots[i].busy);
                if let Some(i) = found {
                    ring.slots[i].busy = true;
                    ring.next = (i + 1) % n;
                    let s = &ring.slots[i];
                    break Some((i, ring.token(i), s.texture.clone(), s.keyed_mutex.clone(), s.handle_value(), ring.width, ring.height));
                }
                let now = Instant::now();
                if now >= deadline || sh.stop.load(Ordering::Acquire) {
                    break None;
                }
                guard = sh.ring_cv.wait_timeout(guard, deadline - now).unwrap().0;
            }
        };
        let Some((index, token, texture, keyed, nt_handle, fw, fh)) = picked else {
            sh.counters.stalls.fetch_add(1, Ordering::Relaxed);
            // Let mpv drop the frame without drawing it.
            let mut skip: i32 = 1;
            let mut p = [
                MpvRenderParam { type_: MPV_RENDER_PARAM_SKIP_RENDERING, data: &mut skip as *mut _ as *mut c_void },
                MpvRenderParam { type_: 0, data: std::ptr::null_mut() },
            ];
            unsafe { (mpv.render_context_render)(ctx, p.as_mut_ptr()) };
            continue;
        };

        let t0 = Instant::now();
        let mut ok = true;
        if let Some(km) = &keyed {
            if unsafe { km.AcquireSync(0, 1000) }.is_err() {
                sh.log.line("AcquireSync failed");
                ok = false;
            }
        }
        if ok {
            let mut fbo = MpvD3d11Fbo { tex: texture.as_raw() };
            let mut block: i32 = sh.block as i32;
            let mut p = [
                MpvRenderParam { type_: MPV_RENDER_PARAM_D3D11_FBO, data: &mut fbo as *mut _ as *mut c_void },
                MpvRenderParam { type_: MPV_RENDER_PARAM_BLOCK_FOR_TARGET_TIME, data: &mut block as *mut _ as *mut c_void },
                MpvRenderParam { type_: 0, data: std::ptr::null_mut() },
            ];
            let rc = unsafe { (mpv.render_context_render)(ctx, p.as_mut_ptr()) };
            if rc < 0 {
                sh.log.line(&format!("render failed: {}", mpv.err(rc)));
                ok = false;
            }
            if !fence.flush_and_wait(&gpu.context, Duration::from_secs(1)) {
                sh.counters.fence_timeouts.fetch_add(1, Ordering::Relaxed);
                sh.log.line("GPU fence timed out");
            }
            if let Some(km) = &keyed {
                let _ = unsafe { km.ReleaseSync(0) };
            }
            unsafe { (mpv.render_context_report_swap)(ctx) };
        }
        let render_us = t0.elapsed().as_micros() as u64;
        if !ok {
            sh.counters.render_errors.fetch_add(1, Ordering::Relaxed);
            if let Some(r) = sh.ring.lock().unwrap().as_mut() {
                if r.generation == token >> 8 {
                    r.slots[index].busy = false;
                }
            }
            continue;
        }
        let c = &sh.counters;
        c.frames.fetch_add(1, Ordering::Relaxed);
        c.render_us_total.fetch_add(render_us, Ordering::Relaxed);
        c.render_us_max.fetch_max(render_us, Ordering::Relaxed);
        on_frame(Frame {
            slot: token,
            width: fw,
            height: fh,
            nt_handle,
            timestamp_us: epoch.elapsed().as_micros() as u64,
            render_ms: render_us as f64 / 1000.0,
        });
    }

    // Render context goes before mpv_terminate_destroy (done by Player::destroy afterwards).
    unsafe {
        (mpv.render_context_set_update_callback)(ctx, None, std::ptr::null_mut());
        (mpv.render_context_free)(ctx);
        drop(Arc::from_raw(wake_ptr));
    }
    sh.log.line("render context freed");
}

fn event_thread(sh: Arc<Shared>, on_event: EventFn) {
    let mpv = &sh.mpv;
    while !sh.stop.load(Ordering::Acquire) {
        // SAFETY: the event is valid until the next mpv_wait_event call on this handle.
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
                if ev.reply_userdata == PROP_DWIDTH || ev.reply_userdata == PROP_DHEIGHT {
                    let n = value.as_deref().and_then(|v| v.parse().ok()).unwrap_or(0);
                    let slot = if ev.reply_userdata == PROP_DWIDTH { &sh.want_w } else { &sh.want_h };
                    if slot.swap(n, Ordering::Relaxed) != n {
                        sh.redraw.store(true, Ordering::Release);
                        sh.wake.notify();
                    }
                }
                on_event(Event::Property { name, value });
            },
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
                let (prefix, level, text) = (lossy(m.prefix), lossy(m.level), lossy(m.text));
                sh.log.line(&format!("mpv {level} [{prefix}] {}", text.trim_end()));
                on_event(Event::Log { prefix, level, text });
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
