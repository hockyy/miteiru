//! OpenGL rendering through libmpv's render API, for platforms where `--wid` can't put the video
//! under the webview (macOS has no `--wid`; on Linux GTK draws the webview into the same native
//! window). The platform code owns a GL surface (CAOpenGLLayer, GtkGLArea) and calls
//! [`GlRenderer::render`] with its framebuffer whenever the update callback asks for a frame.
//!
//! render.h rules: every GlRenderer call happens on the thread whose GL context is current, that
//! thread makes no other libmpv calls, and the update callback only schedules a redraw.

use std::ffi::{c_char, c_int, c_void, CStr};
use std::sync::Arc;

use crate::mpv::Mpv;
use crate::MpvClient;

const MPV_RENDER_PARAM_INVALID: c_int = 0;
const MPV_RENDER_PARAM_API_TYPE: c_int = 1;
const MPV_RENDER_PARAM_OPENGL_INIT_PARAMS: c_int = 2;
const MPV_RENDER_PARAM_OPENGL_FBO: c_int = 3;
const MPV_RENDER_PARAM_FLIP_Y: c_int = 4;
const MPV_RENDER_API_TYPE_OPENGL: &[u8] = b"opengl\0";
pub const MPV_RENDER_UPDATE_FRAME: u64 = 1;

#[repr(C)]
struct RenderParam {
    type_: c_int,
    data: *mut c_void,
}

/// `mpv_opengl_init_params`.
#[repr(C)]
struct OpenGlInitParams {
    get_proc_address: unsafe extern "C" fn(ctx: *mut c_void, name: *const c_char) -> *mut c_void,
    get_proc_address_ctx: *mut c_void,
}

/// `mpv_opengl_fbo`.
#[repr(C)]
struct OpenGlFbo {
    fbo: c_int,
    w: c_int,
    h: c_int,
    internal_format: c_int,
}

/// Resolves a GL function by name for the current context (platform-specific).
pub type GetProcAddress = unsafe extern "C" fn(ctx: *mut c_void, name: *const c_char) -> *mut c_void;

type UpdateBox = Box<dyn Fn() + Send + Sync>;

unsafe extern "C" fn on_update(ctx: *mut c_void) {
    // Only schedules a redraw; never calls into mpv (render.h).
    (*(ctx as *const UpdateBox))();
}

pub struct GlRenderer {
    ctx: *mut c_void,
    update: *mut UpdateBox,
    client: Arc<MpvClient>,
}

// The context is only used on the GL thread, but the owner may be created and dropped elsewhere.
unsafe impl Send for GlRenderer {}

impl GlRenderer {
    /// Create the render context. Call with the GL context current. `request_redraw` runs on mpv's
    /// threads and must only schedule a call to `render` on the GL thread.
    ///
    /// # Safety
    /// `get_proc_address` must resolve functions of the GL context that is current now and during
    /// every later call on this renderer.
    pub unsafe fn new(
        client: Arc<MpvClient>,
        get_proc_address: GetProcAddress,
        get_proc_address_ctx: *mut c_void,
        request_redraw: impl Fn() + Send + Sync + 'static,
    ) -> Result<GlRenderer, String> {
        let mpv: &Mpv = client.mpv();
        let mut init = OpenGlInitParams { get_proc_address, get_proc_address_ctx };
        let mut params = [
            RenderParam { type_: MPV_RENDER_PARAM_API_TYPE, data: MPV_RENDER_API_TYPE_OPENGL.as_ptr() as *mut c_void },
            RenderParam { type_: MPV_RENDER_PARAM_OPENGL_INIT_PARAMS, data: &mut init as *mut _ as *mut c_void },
            RenderParam { type_: MPV_RENDER_PARAM_INVALID, data: std::ptr::null_mut() },
        ];
        let mut ctx: *mut c_void = std::ptr::null_mut();
        let rc = (mpv.render_context_create)(&mut ctx, client.raw(), params.as_mut_ptr() as *mut c_void);
        mpv.check(rc, "mpv_render_context_create")?;
        let update: *mut UpdateBox = Box::into_raw(Box::new(Box::new(request_redraw)));
        (mpv.render_context_set_update_callback)(ctx, Some(on_update), update as *mut c_void);
        Ok(GlRenderer { ctx, update, client })
    }

    /// Flags from mpv_render_context_update (MPV_RENDER_UPDATE_FRAME: a new frame is due).
    pub fn update(&self) -> u64 {
        unsafe { (self.client.mpv().render_context_update)(self.ctx) }
    }

    /// Draw the current frame into framebuffer `fbo` of `w`×`h` pixels. `flip_y` for framebuffers
    /// with the origin at the bottom-left, such as a GL default framebuffer or CAOpenGLLayer.
    pub fn render(&self, fbo: i32, w: i32, h: i32, flip_y: bool) {
        let mut target = OpenGlFbo { fbo, w, h, internal_format: 0 };
        let mut flip: c_int = flip_y as c_int;
        let mut params = [
            RenderParam { type_: MPV_RENDER_PARAM_OPENGL_FBO, data: &mut target as *mut _ as *mut c_void },
            RenderParam { type_: MPV_RENDER_PARAM_FLIP_Y, data: &mut flip as *mut _ as *mut c_void },
            RenderParam { type_: MPV_RENDER_PARAM_INVALID, data: std::ptr::null_mut() },
        ];
        unsafe {
            (self.client.mpv().render_context_render)(self.ctx, params.as_mut_ptr() as *mut c_void);
        }
    }

    /// Tell mpv the frame reached the screen (improves its timing).
    pub fn report_swap(&self) {
        unsafe { (self.client.mpv().render_context_report_swap)(self.ctx) }
    }
}

impl Drop for GlRenderer {
    /// Must run on the GL thread with the context current, before the client is destroyed.
    fn drop(&mut self) {
        unsafe {
            let mpv = self.client.mpv();
            (mpv.render_context_set_update_callback)(self.ctx, None, std::ptr::null_mut());
            (mpv.render_context_free)(self.ctx);
            drop(Box::from_raw(self.update));
        }
    }
}

/// Name of a GL symbol, for logging from get_proc_address implementations.
///
/// # Safety
/// `name` must be a valid C string.
pub unsafe fn symbol_name(name: *const c_char) -> String {
    CStr::from_ptr(name).to_string_lossy().into_owned()
}
