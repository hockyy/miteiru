//! Minimal hand-written libmpv FFI, resolved at runtime with `libloading`.
//!
//! Constants come from libmpv 0.42 `client.h`.

use std::ffi::{c_char, c_double, c_int, c_void, CStr, CString};
use std::path::Path;

use libloading::Library;

pub const MPV_FORMAT_STRING: c_int = 1;

pub const MPV_EVENT_NONE: c_int = 0;
pub const MPV_EVENT_SHUTDOWN: c_int = 1;
pub const MPV_EVENT_LOG_MESSAGE: c_int = 2;
pub const MPV_EVENT_SET_PROPERTY_REPLY: c_int = 4;
pub const MPV_EVENT_COMMAND_REPLY: c_int = 5;
pub const MPV_EVENT_START_FILE: c_int = 6;
pub const MPV_EVENT_END_FILE: c_int = 7;
pub const MPV_EVENT_FILE_LOADED: c_int = 8;
pub const MPV_EVENT_VIDEO_RECONFIG: c_int = 17;
pub const MPV_EVENT_SEEK: c_int = 20;
pub const MPV_EVENT_PLAYBACK_RESTART: c_int = 21;
pub const MPV_EVENT_PROPERTY_CHANGE: c_int = 22;



#[repr(C)]
pub struct MpvEvent {
    pub event_id: c_int,
    pub error: c_int,
    pub reply_userdata: u64,
    pub data: *mut c_void,
}

#[repr(C)]
pub struct MpvEventProperty {
    pub name: *const c_char,
    pub format: c_int,
    pub data: *mut c_void,
}

#[repr(C)]
pub struct MpvEventLogMessage {
    pub prefix: *const c_char,
    pub level: *const c_char,
    pub text: *const c_char,
    pub log_level: c_int,
}

#[repr(C)]
pub struct MpvEventEndFile {
    pub reason: c_int,
    pub error: c_int,
}




pub type Handle = *mut c_void;

/// Resolved libmpv entry points. The library stays loaded for as long as this lives.
pub struct Mpv {
    pub create: unsafe extern "C" fn() -> Handle,
    pub set_option_string: unsafe extern "C" fn(Handle, *const c_char, *const c_char) -> c_int,
    pub initialize: unsafe extern "C" fn(Handle) -> c_int,
    // Only the async request functions: callers never wait for the mpv core (see lib.rs).
    pub command_async: unsafe extern "C" fn(Handle, u64, *mut *const c_char) -> c_int,
    pub set_property_async: unsafe extern "C" fn(Handle, u64, *const c_char, c_int, *mut c_void) -> c_int,
    pub observe_property: unsafe extern "C" fn(Handle, u64, *const c_char, c_int) -> c_int,
    pub request_log_messages: unsafe extern "C" fn(Handle, *const c_char) -> c_int,
    pub wait_event: unsafe extern "C" fn(Handle, c_double) -> *mut MpvEvent,
    pub wakeup: unsafe extern "C" fn(Handle),
    pub error_string: unsafe extern "C" fn(c_int) -> *const c_char,
    pub terminate_destroy: unsafe extern "C" fn(Handle),
    // Render API (render.rs); params are passed as an opaque mpv_render_param array.
    pub render_context_create: unsafe extern "C" fn(*mut *mut c_void, Handle, *mut c_void) -> c_int,
    pub render_context_set_update_callback:
        unsafe extern "C" fn(*mut c_void, Option<unsafe extern "C" fn(*mut c_void)>, *mut c_void),
    pub render_context_update: unsafe extern "C" fn(*mut c_void) -> u64,
    pub render_context_render: unsafe extern "C" fn(*mut c_void, *mut c_void) -> c_int,
    pub render_context_report_swap: unsafe extern "C" fn(*mut c_void),
    pub render_context_free: unsafe extern "C" fn(*mut c_void),
    _lib: Library,
}

// The function pointers are plain `extern "C"` fns and libmpv's client API is thread-safe.
unsafe impl Send for Mpv {}
unsafe impl Sync for Mpv {}

macro_rules! sym {
    ($lib:expr, $name:literal) => {
        *$lib
            .get(concat!($name, "\0").as_bytes())
            .map_err(|e| format!("missing symbol {}: {e}", $name))?
    };
}

impl Mpv {
    pub fn load(path: &Path) -> Result<Mpv, String> {
        // SAFETY: loading a DLL runs its initialisers; the caller chose the path.
        unsafe {
            let lib = Library::new(path).map_err(|e| format!("cannot load {}: {e}", path.display()))?;
            Ok(Mpv {
                create: sym!(lib, "mpv_create"),
                set_option_string: sym!(lib, "mpv_set_option_string"),
                initialize: sym!(lib, "mpv_initialize"),
                command_async: sym!(lib, "mpv_command_async"),
                set_property_async: sym!(lib, "mpv_set_property_async"),
                observe_property: sym!(lib, "mpv_observe_property"),
                request_log_messages: sym!(lib, "mpv_request_log_messages"),
                wait_event: sym!(lib, "mpv_wait_event"),
                wakeup: sym!(lib, "mpv_wakeup"),
                error_string: sym!(lib, "mpv_error_string"),
                terminate_destroy: sym!(lib, "mpv_terminate_destroy"),
                render_context_create: sym!(lib, "mpv_render_context_create"),
                render_context_set_update_callback: sym!(lib, "mpv_render_context_set_update_callback"),
                render_context_update: sym!(lib, "mpv_render_context_update"),
                render_context_render: sym!(lib, "mpv_render_context_render"),
                render_context_report_swap: sym!(lib, "mpv_render_context_report_swap"),
                render_context_free: sym!(lib, "mpv_render_context_free"),
                _lib: lib,
            })
        }
    }

    pub fn err(&self, code: c_int) -> String {
        // SAFETY: mpv_error_string returns a static string.
        unsafe {
            let p = (self.error_string)(code);
            if p.is_null() {
                format!("mpv error {code}")
            } else {
                format!("{} ({code})", CStr::from_ptr(p).to_string_lossy())
            }
        }
    }

    pub fn check(&self, code: c_int, what: &str) -> Result<(), String> {
        if code < 0 {
            Err(format!("{what}: {}", self.err(code)))
        } else {
            Ok(())
        }
    }

    pub fn set_option(&self, h: Handle, name: &str, value: &str) -> Result<(), String> {
        let (n, v) = (cstr(name)?, cstr(value)?);
        self.check(unsafe { (self.set_option_string)(h, n.as_ptr(), v.as_ptr()) }, &format!("option {name}={value}"))
    }

    /// Queue a property write; mpv copies the value. Errors come back as SET_PROPERTY_REPLY.
    pub fn set_property_async(&self, h: Handle, name: &str, value: &str) -> Result<(), String> {
        let (n, v) = (cstr(name)?, cstr(value)?);
        let mut p = v.as_ptr();
        let data = &mut p as *mut *const c_char as *mut c_void;
        self.check(
            unsafe { (self.set_property_async)(h, 0, n.as_ptr(), MPV_FORMAT_STRING, data) },
            &format!("property {name}={value}"),
        )
    }

    /// Queue a command; mpv copies the arguments. Errors come back as COMMAND_REPLY.
    pub fn command_async(&self, h: Handle, args: &[String]) -> Result<(), String> {
        let owned: Vec<CString> = args.iter().map(|a| cstr(a)).collect::<Result<_, _>>()?;
        let mut ptrs: Vec<*const c_char> = owned.iter().map(|c| c.as_ptr()).collect();
        ptrs.push(std::ptr::null());
        self.check(
            unsafe { (self.command_async)(h, 0, ptrs.as_mut_ptr()) },
            &format!("command {}", args.first().map(String::as_str).unwrap_or("")),
        )
    }

    pub fn observe(&self, h: Handle, id: u64, name: &str) -> Result<(), String> {
        let n = cstr(name)?;
        self.check(unsafe { (self.observe_property)(h, id, n.as_ptr(), MPV_FORMAT_STRING) }, &format!("observe {name}"))
    }
}

fn cstr(s: &str) -> Result<CString, String> {
    CString::new(s).map_err(|_| format!("string contains NUL: {s:?}"))
}

/// Copy a possibly-null C string.
///
/// # Safety
/// `p` must be null or point to a valid NUL-terminated string.
pub unsafe fn lossy(p: *const c_char) -> String {
    if p.is_null() {
        String::new()
    } else {
        CStr::from_ptr(p).to_string_lossy().into_owned()
    }
}
