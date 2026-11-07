//! macOS and Linux: libmpv's render API draws into a GL surface placed under the webview.
//! (Windows embeds mpv's own window instead; see player.rs.) Everything here runs on the main
//! thread: Tauri runs synchronous commands there, and GTK/AppKit require it.
//!
//! The render context is created while attaching, before any file loads: `vo=libmpv` fails to
//! start when a video begins playing without one. It is freed before mpv is destroyed.

use std::sync::Arc;

use miteiru_mpv::MpvClient;
use tauri::WebviewWindow;

pub use imp::{attach, detach, forget};

#[cfg(target_os = "macos")]
mod imp {
    use super::*;
    use std::collections::HashMap;
    use std::ffi::{c_char, c_int, c_void};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Mutex, OnceLock};

    use miteiru_mpv::render::GlRenderer;

    extern "C" {
        fn mv_attach(
            ns_window: *mut c_void,
            ctx: *mut c_void,
            init: extern "C" fn(*mut c_void) -> c_int,
            draw: extern "C" fn(*mut c_void, c_int, c_int, c_int),
            release: extern "C" fn(*mut c_void),
        ) -> *mut c_void;
        fn mv_request_redraw(handle: *mut c_void);
        fn mv_detach(handle: *mut c_void);
        fn mv_gl_proc(name: *const c_char) -> *mut c_void;
    }

    struct Surface {
        client: Arc<MpvClient>,
        renderer: Mutex<Option<GlRenderer>>,
        /// The view handle, for redraw requests (0 until mv_attach returns).
        view: Arc<AtomicUsize>,
    }

    struct Attached {
        surface: *mut Surface,
        view: *mut c_void,
    }
    // Only used on the main thread; the map needs Send to live in a static.
    unsafe impl Send for Attached {}

    fn attached() -> &'static Mutex<HashMap<String, Attached>> {
        static ATTACHED: OnceLock<Mutex<HashMap<String, Attached>>> = OnceLock::new();
        ATTACHED.get_or_init(Default::default)
    }

    unsafe extern "C" fn gl_proc(_ctx: *mut c_void, name: *const c_char) -> *mut c_void {
        mv_gl_proc(name)
    }

    /// Called once with the layer's GL context current. Returns 0 on success.
    extern "C" fn init(ctx: *mut c_void) -> c_int {
        let surface = unsafe { &*(ctx as *const Surface) };
        let view = surface.view.clone();
        let redraw = move || {
            let handle = view.load(Ordering::Acquire);
            if handle != 0 {
                unsafe { mv_request_redraw(handle as *mut c_void) };
            }
        };
        match unsafe { GlRenderer::new(surface.client.clone(), gl_proc, std::ptr::null_mut(), redraw) } {
            Ok(r) => {
                *surface.renderer.lock().unwrap() = Some(r);
                0
            }
            Err(e) => {
                log::error!("mpv render context: {e}");
                1
            }
        }
    }

    /// Called by the layer with its GL context current.
    extern "C" fn draw(ctx: *mut c_void, fbo: c_int, width: c_int, height: c_int) {
        let surface = unsafe { &*(ctx as *const Surface) };
        if let Some(r) = surface.renderer.lock().unwrap().as_ref() {
            r.update();
            // The layer's framebuffer has its origin at the bottom-left.
            r.render(fbo, width, height, true);
            r.report_swap();
        }
    }

    /// Called during detach with the GL context current: frees the render context.
    extern "C" fn release(ctx: *mut c_void) {
        let surface = unsafe { &*(ctx as *const Surface) };
        surface.renderer.lock().unwrap().take();
    }

    pub fn attach(window: &WebviewWindow, client: Arc<MpvClient>) -> Result<(), String> {
        let ns_window = window.ns_window().map_err(|e| e.to_string())?;
        let view_handle = Arc::new(AtomicUsize::new(0));
        let surface = Box::into_raw(Box::new(Surface {
            client,
            renderer: Mutex::new(None),
            view: view_handle.clone(),
        }));
        let view = unsafe { mv_attach(ns_window, surface as *mut c_void, init, draw, release) };
        if view.is_null() {
            // Nothing was created on the GL side.
            unsafe { drop(Box::from_raw(surface)) };
            return Err("could not create an OpenGL surface for the video".into());
        }
        view_handle.store(view as usize, Ordering::Release);
        attached().lock().unwrap().insert(window.label().to_string(), Attached { surface, view });
        Ok(())
    }

    /// Free the render context and remove the video view.
    pub fn detach(label: &str) {
        let entry = attached().lock().unwrap().remove(label);
        if let Some(a) = entry {
            unsafe {
                mv_detach(a.view);
                drop(Box::from_raw(a.surface));
            }
        }
    }

    /// The window is gone: the retained view still owns its GL context, so detach normally.
    pub fn forget(label: &str) {
        detach(label);
    }
}

#[cfg(target_os = "linux")]
mod imp {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::ffi::{c_char, c_int, c_void};
    use std::rc::Rc;
    use std::sync::OnceLock;

    use gtk::glib;
    use gtk::prelude::*;
    use miteiru_mpv::render::GlRenderer;

    const GL_DRAW_FRAMEBUFFER_BINDING: u32 = 0x8CA6;

    type ProcLookup = unsafe extern "C" fn(*const c_char) -> *mut c_void;

    /// GTK 3 uses EGL on Wayland and GLX on X11; mpv needs the matching function lookup.
    struct GlLoader {
        egl: Option<ProcLookup>,
        glx: Option<ProcLookup>,
        _libs: Vec<libloading::Library>,
    }

    fn loader() -> &'static GlLoader {
        static LOADER: OnceLock<GlLoader> = OnceLock::new();
        LOADER.get_or_init(|| unsafe {
            let mut libs = Vec::new();
            let mut find = |lib: &str, sym: &[u8]| -> Option<ProcLookup> {
                let l = libloading::Library::new(lib).ok()?;
                let f = *l.get::<ProcLookup>(sym).ok()?;
                libs.push(l);
                Some(f)
            };
            let egl = find("libEGL.so.1", b"eglGetProcAddress\0");
            let glx = find("libGL.so.1", b"glXGetProcAddressARB\0");
            GlLoader { egl, glx, _libs: libs }
        })
    }

    const BACKEND_GLX: usize = 1;
    const BACKEND_EGL: usize = 2;

    /// `ctx` carries the backend, chosen from the display GTK runs on.
    unsafe extern "C" fn gl_proc(ctx: *mut c_void, name: *const c_char) -> *mut c_void {
        let l = loader();
        let lookup = if ctx as usize == BACKEND_EGL { l.egl } else { l.glx };
        match lookup {
            Some(f) => f(name),
            None => std::ptr::null_mut(),
        }
    }

    fn backend() -> usize {
        let wayland = gtk::gdk::Display::default().is_some_and(|d| d.type_().name() == "GdkWaylandDisplay");
        if wayland {
            BACKEND_EGL
        } else {
            BACKEND_GLX
        }
    }

    /// The framebuffer GtkGLArea bound for this frame.
    fn current_framebuffer(backend: usize) -> i32 {
        type GetIntegerv = unsafe extern "C" fn(u32, *mut c_int);
        let f = unsafe { gl_proc(backend as *mut c_void, b"glGetIntegerv\0".as_ptr() as *const c_char) };
        if f.is_null() {
            return 0;
        }
        let get: GetIntegerv = unsafe { std::mem::transmute(f) };
        let mut fbo: c_int = 0;
        unsafe { get(GL_DRAW_FRAMEBUFFER_BINDING, &mut fbo) };
        fbo
    }

    type Renderer = Rc<RefCell<Option<GlRenderer>>>;

    struct Surface {
        vbox: gtk::Box,
        overlay: gtk::Overlay,
        area: gtk::GLArea,
        webview: gtk::Widget,
        renderer: Renderer,
    }

    thread_local! {
        static SURFACES: RefCell<HashMap<String, Surface>> = RefCell::new(HashMap::new());
    }

    fn position_in(vbox: &gtk::Box, child: &impl IsA<gtk::Widget>) -> i32 {
        let child = child.as_ref();
        vbox.children().iter().position(|w| w == child).map_or(-1, |i| i as i32)
    }

    /// Put the webview back where it was and drop the GL area.
    fn restore(s: &Surface) {
        let pos = position_in(&s.vbox, &s.overlay);
        s.overlay.remove(&s.webview);
        s.vbox.remove(&s.overlay);
        s.vbox.pack_start(&s.webview, true, true, 0);
        if pos >= 0 {
            s.vbox.reorder_child(&s.webview, pos);
        }
        s.webview.show();
        s.webview.grab_focus();
    }

    pub fn attach(window: &WebviewWindow, client: Arc<MpvClient>) -> Result<(), String> {
        let vbox = window.default_vbox().map_err(|e| e.to_string())?;
        let webview = vbox
            .children()
            .into_iter()
            .find(|w| w.type_().name() == "WebKitWebView")
            .ok_or("webview widget not found")?;
        // The webview moves into an overlay above a GL area that shows the video.
        let pos = position_in(&vbox, &webview);
        vbox.remove(&webview);
        let overlay = gtk::Overlay::new();
        let area = gtk::GLArea::new();
        area.set_has_alpha(false);
        area.set_auto_render(false);
        overlay.add(&area);
        overlay.add_overlay(&webview);
        vbox.pack_start(&overlay, true, true, 0);
        if pos >= 0 {
            vbox.reorder_child(&overlay, pos);
        }

        let backend = backend();
        let renderer: Renderer = Rc::new(RefCell::new(None));
        let weak = glib::SendWeakRef::from(area.downgrade());
        {
            let renderer = renderer.clone();
            area.connect_realize(move |area| {
                area.make_current();
                if let Some(err) = area.error() {
                    log::error!("GLArea: {err}");
                    return;
                }
                let weak = weak.clone();
                // Runs on mpv's threads: only schedule a frame on the main loop.
                let redraw = move || {
                    let weak = weak.clone();
                    glib::MainContext::default().invoke(move || {
                        if let Some(area) = weak.upgrade() {
                            area.queue_render();
                        }
                    });
                };
                match unsafe { GlRenderer::new(client.clone(), gl_proc, backend as *mut c_void, redraw) } {
                    Ok(r) => *renderer.borrow_mut() = Some(r),
                    Err(e) => log::error!("mpv render context: {e}"),
                }
            });
        }
        {
            let renderer = renderer.clone();
            area.connect_render(move |area, _| {
                if let Some(r) = renderer.borrow().as_ref() {
                    let scale = area.scale_factor();
                    r.update();
                    // GtkGLArea's framebuffer has its origin at the bottom-left.
                    r.render(current_framebuffer(backend), area.allocated_width() * scale, area.allocated_height() * scale, true);
                    r.report_swap();
                }
                glib::Propagation::Stop
            });
        }
        {
            let renderer = renderer.clone();
            area.connect_unrealize(move |area| {
                // Free the render context while its GL context still exists and is current.
                area.make_current();
                renderer.borrow_mut().take();
            });
        }
        overlay.show_all();
        if !area.is_realized() {
            area.realize();
        }
        webview.grab_focus();
        let surface = Surface { vbox, overlay, area, webview, renderer };
        if surface.renderer.borrow().is_none() {
            restore(&surface);
            return Err("could not create an OpenGL surface for the video".into());
        }
        SURFACES.with(|s| s.borrow_mut().insert(window.label().to_string(), surface));
        Ok(())
    }

    /// Free the render context and put the webview back.
    pub fn detach(label: &str) {
        if let Some(s) = SURFACES.with(|s| s.borrow_mut().remove(label)) {
            // Removing the area unrealizes it, which frees the render context.
            restore(&s);
            free_renderer(&s);
        }
    }

    /// The window is being destroyed with its widgets: only make sure the render context is gone.
    pub fn forget(label: &str) {
        if let Some(s) = SURFACES.with(|s| s.borrow_mut().remove(label)) {
            free_renderer(&s);
        }
    }

    fn free_renderer(s: &Surface) {
        if s.renderer.borrow().is_some() && s.area.is_realized() {
            s.area.make_current();
        }
        s.renderer.borrow_mut().take();
    }
}
