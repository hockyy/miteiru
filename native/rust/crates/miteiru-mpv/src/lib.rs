//! libmpv for Miteiru's desktop shell: loaded at runtime, embedded into a native window with
//! `--wid`, driven only through non-blocking calls. Cross-platform (Windows, macOS, Linux).

mod client;
mod mpv;
pub mod render;

pub use client::{ClientOptions, MpvClient, VideoOutput};

use std::sync::Arc;

#[derive(Clone, Debug)]
pub enum Event {
    Property { name: String, value: Option<String> },
    EndFile { reason: String, error: Option<String> },
    Log { prefix: String, level: String, text: String },
    Notice(&'static str),
    Shutdown,
}

pub type EventFn = Arc<dyn Fn(Event) + Send + Sync>;
