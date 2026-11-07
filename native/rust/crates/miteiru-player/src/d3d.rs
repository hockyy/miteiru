//! D3D11 device creation (adapter matching) and the shared-texture ring.

use std::ffi::c_void;
use std::time::{Duration, Instant};

use windows::core::Interface;
use windows::Win32::Foundation::{CloseHandle, HANDLE, HMODULE};
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_UNKNOWN, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_11_0,
    D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Multithread, ID3D11Query,
    ID3D11Texture2D, D3D11_BIND_RENDER_TARGET, D3D11_BIND_SHADER_RESOURCE,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_QUERY_DESC, D3D11_QUERY_EVENT,
    D3D11_RESOURCE_MISC_SHARED, D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX,
    D3D11_RESOURCE_MISC_SHARED_NTHANDLE, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC,
    D3D11_USAGE_DEFAULT,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter, IDXGIAdapter1, IDXGIFactory1, IDXGIKeyedMutex,
    IDXGIResource1, DXGI_SHARED_RESOURCE_READ, DXGI_SHARED_RESOURCE_WRITE,
};

/// How completion of the mpv render is made visible to the other device (Chromium's).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SyncMode {
    /// SHARED | SHARED_NTHANDLE texture; Flush + D3D11_QUERY_EVENT wait before notifying.
    Query,
    /// SHARED_KEYEDMUTEX | SHARED_NTHANDLE texture; AcquireSync(0)/ReleaseSync(0) around render.
    KeyedMutex,
}

impl SyncMode {
    pub fn parse(s: &str) -> Option<SyncMode> {
        match s {
            "query" => Some(SyncMode::Query),
            "keyedmutex" => Some(SyncMode::KeyedMutex),
            _ => None,
        }
    }
}

pub struct Gpu {
    pub device: ID3D11Device,
    pub context: ID3D11DeviceContext,
    pub description: String,
}

fn wide_to_string(w: &[u16]) -> String {
    let end = w.iter().position(|&c| c == 0).unwrap_or(w.len());
    String::from_utf16_lossy(&w[..end])
}

/// Create the D3D11 device on the adapter matching `(vendor_id, device_id)`, or the default one.
pub fn create_gpu(want: Option<(u32, u32)>, log: &dyn Fn(String)) -> Result<Gpu, String> {
    let e = |what: &str, err: windows::core::Error| format!("{what}: {err}");
    // SAFETY: plain COM calls on objects we own.
    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1().map_err(|x| e("CreateDXGIFactory1", x))?;
        let mut chosen: Option<(IDXGIAdapter1, String)> = None;
        let mut i = 0;
        while let Ok(adapter) = factory.EnumAdapters1(i) {
            if let Ok(d) = adapter.GetDesc1() {
                let name = wide_to_string(&d.Description);
                log(format!(
                    "dxgi adapter {i}: {name} vendor=0x{:04x} device=0x{:04x} luid={:08x}:{:08x}",
                    d.VendorId, d.DeviceId, d.AdapterLuid.HighPart as u32, d.AdapterLuid.LowPart
                ));
                if chosen.is_none() && want == Some((d.VendorId, d.DeviceId)) {
                    chosen = Some((adapter.clone(), format!("{name} (matched Chromium's GPU) luid={:08x}:{:08x}", d.AdapterLuid.HighPart as u32, d.AdapterLuid.LowPart)));
                }
            }
            i += 1;
        }
        if chosen.is_none() {
            log(format!("no DXGI adapter matched {want:?}; using the default adapter"));
        }

        let levels: [D3D_FEATURE_LEVEL; 2] = [D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0];
        let mut device: Option<ID3D11Device> = None;
        let mut context: Option<ID3D11DeviceContext> = None;
        let mut got_level = D3D_FEATURE_LEVEL::default();
        // Not D3D11_CREATE_DEVICE_SINGLETHREADED: d3d11va decodes on this device from another thread.
        let flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
        let result = match &chosen {
            Some((adapter, _)) => {
                let base: IDXGIAdapter = adapter.cast().map_err(|x| e("cast IDXGIAdapter", x))?;
                D3D11CreateDevice(
                    &base,
                    D3D_DRIVER_TYPE_UNKNOWN,
                    HMODULE::default(),
                    flags,
                    Some(&levels),
                    D3D11_SDK_VERSION,
                    Some(&mut device),
                    Some(&mut got_level),
                    Some(&mut context),
                )
            }
            None => D3D11CreateDevice(
                None::<&IDXGIAdapter>,
                D3D_DRIVER_TYPE_HARDWARE,
                HMODULE::default(),
                flags,
                Some(&levels),
                D3D11_SDK_VERSION,
                Some(&mut device),
                Some(&mut got_level),
                Some(&mut context),
            ),
        };
        result.map_err(|x| e("D3D11CreateDevice", x))?;
        let device = device.ok_or("D3D11CreateDevice returned no device")?;
        let context = context.ok_or("D3D11CreateDevice returned no context")?;
        if let Ok(mt) = device.cast::<ID3D11Multithread>() {
            let _ = mt.SetMultithreadProtected(true);
        }
        let description = chosen
            .map(|(_, n)| n)
            .unwrap_or_else(|| "default adapter".to_string());
        log(format!("d3d11 device created on {description}, feature level 0x{:x}", got_level.0));
        Ok(Gpu { device, context, description })
    }
}

pub struct Slot {
    pub texture: ID3D11Texture2D,
    /// NT handle value, owned by this slot until the ring is dropped.
    handle: usize,
    pub keyed_mutex: Option<IDXGIKeyedMutex>,
    pub busy: bool,
}

impl Slot {
    pub fn handle_value(&self) -> u64 {
        self.handle as u64
    }
}

/// A set of equally-sized shared BGRA textures. Dropping closes the NT handles.
pub struct Ring {
    pub width: u32,
    pub height: u32,
    pub generation: u32,
    pub slots: Vec<Slot>,
    pub next: usize,
}

impl Ring {
    pub fn new(
        device: &ID3D11Device,
        width: u32,
        height: u32,
        count: usize,
        sync: SyncMode,
        generation: u32,
    ) -> Result<Ring, String> {
        let misc = match sync {
            SyncMode::Query => D3D11_RESOURCE_MISC_SHARED.0 | D3D11_RESOURCE_MISC_SHARED_NTHANDLE.0,
            SyncMode::KeyedMutex => {
                D3D11_RESOURCE_MISC_SHARED_KEYEDMUTEX.0 | D3D11_RESOURCE_MISC_SHARED_NTHANDLE.0
            }
        };
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: DXGI_FORMAT_B8G8R8A8_UNORM,
            SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
            Usage: D3D11_USAGE_DEFAULT,
            BindFlags: (D3D11_BIND_RENDER_TARGET.0 | D3D11_BIND_SHADER_RESOURCE.0) as u32,
            CPUAccessFlags: 0,
            MiscFlags: misc as u32,
        };
        let mut ring = Ring { width, height, generation, slots: Vec::new(), next: 0 };
        for i in 0..count {
            // SAFETY: COM calls; `ring` closes handles of the slots already made if we bail out.
            unsafe {
                let mut tex: Option<ID3D11Texture2D> = None;
                device
                    .CreateTexture2D(&desc, None, Some(&mut tex))
                    .map_err(|e| format!("CreateTexture2D {width}x{height} slot {i}: {e}"))?;
                let texture = tex.ok_or("CreateTexture2D returned no texture")?;
                let res: IDXGIResource1 = texture.cast().map_err(|e| format!("cast IDXGIResource1: {e}"))?;
                let handle = res
                    .CreateSharedHandle(
                        None,
                        DXGI_SHARED_RESOURCE_READ.0 | DXGI_SHARED_RESOURCE_WRITE.0,
                        windows::core::PCWSTR::null(),
                    )
                    .map_err(|e| format!("CreateSharedHandle slot {i}: {e}"))?;
                let keyed_mutex = if sync == SyncMode::KeyedMutex {
                    Some(texture.cast::<IDXGIKeyedMutex>().map_err(|e| format!("cast IDXGIKeyedMutex: {e}"))?)
                } else {
                    None
                };
                ring.slots.push(Slot { texture, handle: handle.0 as usize, keyed_mutex, busy: false });
            }
        }
        Ok(ring)
    }

    pub fn all_idle(&self) -> bool {
        self.slots.iter().all(|s| !s.busy)
    }

    /// Slot token handed to JS: generation in the high bits so a late release of a
    /// previous ring cannot free a slot of the current one.
    pub fn token(&self, index: usize) -> u32 {
        (self.generation << 8) | index as u32
    }
}

impl Drop for Ring {
    fn drop(&mut self) {
        for s in &self.slots {
            // SAFETY: the handle was created by CreateSharedHandle and is closed once.
            unsafe {
                let _ = CloseHandle(HANDLE(s.handle as *mut c_void));
            }
        }
    }
}

/// An event query used to wait until the GPU finished the work submitted so far.
pub struct GpuFence {
    query: ID3D11Query,
}

impl GpuFence {
    pub fn new(device: &ID3D11Device) -> Result<GpuFence, String> {
        let desc = D3D11_QUERY_DESC { Query: D3D11_QUERY_EVENT, MiscFlags: 0 };
        let mut q: Option<ID3D11Query> = None;
        // SAFETY: COM call with valid pointers.
        unsafe { device.CreateQuery(&desc, Some(&mut q)) }.map_err(|e| format!("CreateQuery: {e}"))?;
        Ok(GpuFence { query: q.ok_or("CreateQuery returned no query")? })
    }

    /// Flush the immediate context and block until the GPU has executed everything.
    pub fn flush_and_wait(&self, ctx: &ID3D11DeviceContext, timeout: Duration) -> bool {
        // SAFETY: only the render thread touches the immediate context.
        unsafe {
            ctx.End(&self.query);
            ctx.Flush();
            let start = Instant::now();
            let mut done: i32 = 0;
            let mut spins = 0u32;
            loop {
                let _ = ctx.GetData(
                    &self.query,
                    Some(&mut done as *mut i32 as *mut c_void),
                    std::mem::size_of::<i32>() as u32,
                    0,
                );
                if done != 0 {
                    return true;
                }
                if start.elapsed() > timeout {
                    return false;
                }
                spins += 1;
                if spins < 200 {
                    std::hint::spin_loop();
                } else {
                    std::thread::sleep(Duration::from_micros(100));
                }
            }
        }
    }
}
