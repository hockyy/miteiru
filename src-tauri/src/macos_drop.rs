//! macOS delivers drops to the DOM; the native hook preserves Finder's paths before that happens.
use std::collections::HashMap;
use std::ffi::{c_char, c_void, CStr, CString};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::WebviewWindow;

#[derive(Default)]
struct PendingDrops(HashMap<String, (Instant, Vec<String>)>);

impl PendingDrops {
    fn take(&mut self, label: &str) -> Vec<String> {
        self.0.remove(label)
            .filter(|(time, _)| time.elapsed() < Duration::from_secs(10))
            .map(|(_, paths)| paths)
            .unwrap_or_default()
    }
}

fn pending() -> &'static Mutex<PendingDrops> {
    static PENDING: OnceLock<Mutex<PendingDrops>> = OnceLock::new();
    PENDING.get_or_init(Default::default)
}

extern "C" {
    fn md_install(webview: *mut c_void, label: *const c_char,
        callback: extern "C" fn(*const c_char, *const c_char)) -> bool;
}

extern "C" fn capture(label: *const c_char, json: *const c_char) {
    if label.is_null() || json.is_null() { return; }
    // Both strings belong to the native callback and are copied before it returns.
    let label = unsafe { CStr::from_ptr(label) }.to_string_lossy().into_owned();
    let json = unsafe { CStr::from_ptr(json) }.to_string_lossy();
    let paths = serde_json::from_str::<Vec<String>>(&json).unwrap_or_default();
    pending().lock().unwrap().0.insert(label, (Instant::now(), paths));
}

pub fn install(window: &WebviewWindow) -> tauri::Result<()> {
    let label = CString::new(window.label()).expect("window label contains no NUL");
    window.with_webview(move |webview| {
        if !unsafe { md_install(webview.inner().cast(), label.as_ptr(), capture) } {
            log::error!("could not install macOS dropped-file path capture");
        }
    })
}

#[tauri::command]
pub fn drop_paths_take(window: WebviewWindow) -> Vec<String> {
    pending().lock().unwrap().take(window.label())
}

pub fn forget(label: &str) {
    pending().lock().unwrap().0.remove(label);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paths_are_consumed_once_and_only_by_the_receiving_window() {
        let mut drops = PendingDrops::default();
        drops.0.insert("main".into(), (Instant::now(), vec!["/tmp/日本語.mp4".into(), "/tmp/sub.srt".into()]));
        assert!(drops.take("other").is_empty());
        assert_eq!(drops.take("main"), vec!["/tmp/日本語.mp4", "/tmp/sub.srt"]);
        assert!(drops.take("main").is_empty());
    }

    #[test]
    fn expired_and_non_file_drops_do_not_reuse_previous_paths() {
        let mut drops = PendingDrops::default();
        drops.0.insert("main".into(), (Instant::now() - Duration::from_secs(11), vec!["old.mp4".into()]));
        assert!(drops.take("main").is_empty());
        drops.0.insert("main".into(), (Instant::now(), Vec::new()));
        assert!(drops.take("main").is_empty());
    }
}
