fn main() {
    // macOS: the video surface for libmpv's render API is a small Objective-C view.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rerun-if-changed=native/macos_video.m");
        cc::Build::new()
            .file("native/macos_video.m")
            .flag("-fobjc-arc")
            // CAOpenGLLayer and OpenGL are deprecated on macOS but remain the way to host mpv's GL output.
            .flag("-Wno-deprecated-declarations")
            .compile("miteiru_macos_video");
        for framework in ["Cocoa", "QuartzCore", "OpenGL"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
    }
    tauri_build::build()
}
