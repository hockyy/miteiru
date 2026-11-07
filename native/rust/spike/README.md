# libmpv zero-copy spike

A throwaway harness that checks whether libmpv 0.42 (D3D11 render API) can draw video into Miteiru's Electron 41 window through Electron's `sharedTexture` module with no copies, underneath an interactive HTML overlay. Windows only. The numbers and pass/fail list are in [RESULTS.md](RESULTS.md).

## Run it

1. Pick a work folder outside the repo and point `SPIKE_S` at it (PowerShell: `$env:SPIKE_S = 'D:\miteiru-spike'`).
2. Unzip the official LGPL build `libmpv-v0.42.0-x86_64-w64-mingw32-lgpl.zip` from mpv's [v0.42.0 release](https://github.com/mpv-player/mpv/releases/tag/v0.42.0) into `$SPIKE_S\libmpv\`, after checking its SHA-256 against the release page.
3. Generate the test videos: `bash native/rust/spike/gen-media.sh`. It needs ffmpeg with libx265, libx264, hevc_nvenc and the dca, ac3 and eac3 encoders.
4. Run `node native/rust/spike/run.mjs`. It builds the addon (`cargo build --release` in `native/rust`), runs each scenario in its own Electron process and rewrites RESULTS.md. Pass `--only=<label>` to run a subset or `--skip-build` to reuse the last build.

Logs, screenshots and `results.json` go to `$SPIKE_S\spike-logs`. Nothing from the work folder belongs in the repo.

## Layout

- `crates/miteiru-player`: loads libmpv at runtime, creates the D3D11 device on Chromium's GPU, renders into a ring of shared BGRA textures, and runs the render and event threads.
- `crates/miteiru-node`: the napi-rs `Player` class that Electron's main process uses.
- `spike/`: the Electron harness (`main.js`, `renderer.js`), the automation (`run.mjs`) and the results.

The harness window runs with `nodeIntegration` on and `contextIsolation` off to keep the spike short. Miteiru's app window must not.
