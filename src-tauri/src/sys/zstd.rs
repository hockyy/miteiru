//! zstd for the backend worker: the browser's DecompressionStream has no zstd, so a data table's
//! blocks (docs/DATA_FORMAT.md) are decompressed here. The decoder is miteiru-langdata's, shared
//! with the headless language server's addon.

pub(super) use miteiru_langdata::zstd::decompress;
use miteiru_langdata::zstd::MAX_OUTPUT;

/// Decompresses a raw body of zstd frames (shims/zlib.ts zstdDecompress) into a raw response.
#[tauri::command]
pub async fn zstd_decompress(request: tauri::ipc::Request<'_>) -> Result<tauri::ipc::Response, String> {
  let body = super::raw_body(request.body(), "zstd decompress")?;
  decompress(&body, MAX_OUTPUT).map(tauri::ipc::Response::new)
}
