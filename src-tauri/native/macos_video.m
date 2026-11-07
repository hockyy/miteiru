// macOS video surface for libmpv's render API: a CAOpenGLLayer view under the WKWebView.
// mpv has no --wid on macOS, so Miteiru renders frames itself (IINA uses the same approach).
// Rust owns mpv; this file only provides the GL surface and calls back with its context current.
// Everything runs on the main thread except mv_request_redraw.
#define GL_SILENCE_DEPRECATION 1
#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <OpenGL/OpenGL.h>
#import <OpenGL/gl3.h>
#import <dispatch/dispatch.h>

typedef int (*mv_init_cb)(void *ctx);
typedef void (*mv_draw_cb)(void *ctx, int fbo, int width, int height);
typedef void (*mv_release_cb)(void *ctx);

static CGLPixelFormatObj choose_pixel_format(void) {
  CGLPixelFormatAttribute attrs[] = {
      kCGLPFAOpenGLProfile, (CGLPixelFormatAttribute)kCGLOGLPVersion_3_2_Core,
      kCGLPFAAccelerated, kCGLPFADoubleBuffer, kCGLPFAAllowOfflineRenderers,
      kCGLPFAColorSize, (CGLPixelFormatAttribute)24,
      kCGLPFAAlphaSize, (CGLPixelFormatAttribute)8,
      (CGLPixelFormatAttribute)0};
  CGLPixelFormatObj pix = NULL;
  GLint count = 0;
  if (CGLChoosePixelFormat(attrs, &pix, &count) == kCGLNoError && pix) return pix;
  // No accelerated renderer: the software one still beats a black window.
  CGLPixelFormatAttribute fallback[] = {
      kCGLPFAOpenGLProfile, (CGLPixelFormatAttribute)kCGLOGLPVersion_3_2_Core,
      kCGLPFADoubleBuffer, (CGLPixelFormatAttribute)0};
  pix = NULL;
  CGLChoosePixelFormat(fallback, &pix, &count);
  return pix;
}

@interface MiteiruVideoLayer : CAOpenGLLayer {
  CGLPixelFormatObj _pixelFormat;
  CGLContextObj _glContext;
}
@property(nonatomic, assign) void *ctx;
@property(nonatomic, assign) mv_draw_cb drawCb;
@property(nonatomic, assign) mv_release_cb releaseCb;
@end

@implementation MiteiruVideoLayer
- (instancetype)init {
  if ((self = [super init])) {
    self.asynchronous = NO;
    self.needsDisplayOnBoundsChange = YES;
    self.opaque = YES;
    self.backgroundColor = CGColorGetConstantColor(kCGColorBlack);
  }
  return self;
}

/// The GL context exists before the first frame so mpv's render context can be created before
/// any file loads (vo=libmpv fails without one).
- (BOOL)setupContext {
  _pixelFormat = choose_pixel_format();
  if (!_pixelFormat) return NO;
  if (CGLCreateContext(_pixelFormat, NULL, &_glContext) != kCGLNoError || !_glContext) return NO;
  GLint vsync = 1;
  CGLSetParameter(_glContext, kCGLCPSwapInterval, &vsync);
  return YES;
}

- (CGLContextObj)glContext {
  return _glContext;
}

- (CGLPixelFormatObj)copyCGLPixelFormatForDisplayMask:(uint32_t)mask {
  return CGLRetainPixelFormat(_pixelFormat);
}

- (CGLContextObj)copyCGLContextForPixelFormat:(CGLPixelFormatObj)pixelFormat {
  return CGLRetainContext(_glContext);
}

- (BOOL)canDrawInCGLContext:(CGLContextObj)glContext
                pixelFormat:(CGLPixelFormatObj)pixelFormat
               forLayerTime:(CFTimeInterval)timeInterval
                displayTime:(const CVTimeStamp *)timeStamp {
  return YES;
}

- (void)drawInCGLContext:(CGLContextObj)glContext
             pixelFormat:(CGLPixelFormatObj)pixelFormat
            forLayerTime:(CFTimeInterval)timeInterval
             displayTime:(const CVTimeStamp *)timeStamp {
  CGLSetCurrentContext(glContext);
  GLint fbo = 0;
  glGetIntegerv(GL_DRAW_FRAMEBUFFER_BINDING, &fbo);
  GLint viewport[4] = {0, 0, 0, 0};
  glGetIntegerv(GL_VIEWPORT, viewport);
  if (self.drawCb && viewport[2] > 0 && viewport[3] > 0) {
    self.drawCb(self.ctx, fbo, viewport[2], viewport[3]);
  } else {
    glClearColor(0, 0, 0, 1);
    glClear(GL_COLOR_BUFFER_BIT);
  }
  [super drawInCGLContext:glContext pixelFormat:pixelFormat forLayerTime:timeInterval displayTime:timeStamp];
}

/// Free the Rust side's GL resources with the context current, once.
- (void)teardown {
  if (self.releaseCb && _glContext) {
    CGLSetCurrentContext(_glContext);
    self.releaseCb(self.ctx);
    CGLSetCurrentContext(NULL);
  }
  self.drawCb = NULL;
  self.releaseCb = NULL;
}

- (void)dealloc {
  if (_glContext) CGLReleaseContext(_glContext);
  if (_pixelFormat) CGLReleasePixelFormat(_pixelFormat);
}
@end

@interface MiteiruVideoView : NSView
@end

@implementation MiteiruVideoView
- (BOOL)isOpaque {
  return YES;
}
// Clicks belong to the page above.
- (NSView *)hitTest:(NSPoint)point {
  return nil;
}
- (void)viewDidChangeBackingProperties {
  [super viewDidChangeBackingProperties];
  self.layer.contentsScale = self.window.backingScaleFactor;
  [self.layer setNeedsDisplay];
}
@end

static void run_on_main(dispatch_block_t block) {
  if ([NSThread isMainThread]) block();
  else dispatch_sync(dispatch_get_main_queue(), block);
}

/// The page shows the video through a transparent WKWebView (wry's WryWebView subclasses it).
static void make_webviews_transparent(NSView *view) {
  Class webViewClass = NSClassFromString(@"WKWebView");
  for (NSView *sub in view.subviews) {
    if (webViewClass && [sub isKindOfClass:webViewClass]) {
      @try {
        [sub setValue:@NO forKey:@"drawsBackground"];
      } @catch (NSException *e) {
      }
    }
    make_webviews_transparent(sub);
  }
}

/// Puts a video view under everything in the window's content view, after `init` has created
/// the render context with the view's GL context current. Returns an opaque handle, or NULL if
/// no GL context could be created or `init` returned non-zero.
void *mv_attach(void *nsWindow, void *ctx, mv_init_cb init, mv_draw_cb draw, mv_release_cb release) {
  __block MiteiruVideoView *attached = nil;
  run_on_main(^{
    NSWindow *window = (__bridge NSWindow *)nsWindow;
    NSView *content = window.contentView;
    MiteiruVideoLayer *layer = [[MiteiruVideoLayer alloc] init];
    if (!content || ![layer setupContext]) return;
    CGLSetCurrentContext([layer glContext]);
    int failed = init(ctx);
    CGLSetCurrentContext(NULL);
    if (failed) return;
    layer.ctx = ctx;
    layer.drawCb = draw;
    layer.releaseCb = release;
    layer.contentsScale = window.backingScaleFactor;
    MiteiruVideoView *video = [[MiteiruVideoView alloc] initWithFrame:content.bounds];
    // Layer-hosting: the view shows exactly this layer.
    video.layer = layer;
    video.wantsLayer = YES;
    video.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [content addSubview:video positioned:NSWindowBelow relativeTo:nil];
    make_webviews_transparent(content);
    [layer setNeedsDisplay];
    attached = video;
  });
  return attached ? (__bridge_retained void *)attached : NULL;
}

/// Thread-safe: called from mpv's update callback.
void mv_request_redraw(void *handle) {
  MiteiruVideoView *video = (__bridge MiteiruVideoView *)handle;
  dispatch_async(dispatch_get_main_queue(), ^{
    [video.layer setNeedsDisplay];
  });
}

/// Frees GL resources (via the release callback) and removes the view; releases the handle.
void mv_detach(void *handle) {
  MiteiruVideoView *video = (__bridge_transfer MiteiruVideoView *)handle;
  run_on_main(^{
    [(MiteiruVideoLayer *)video.layer teardown];
    [video removeFromSuperview];
  });
}

/// GL function lookup for mpv's render API.
void *mv_gl_proc(const char *name) {
  static CFBundleRef bundle = NULL;
  if (!bundle) bundle = CFBundleGetBundleWithIdentifier(CFSTR("com.apple.opengl"));
  CFStringRef symbol = CFStringCreateWithCString(kCFAllocatorDefault, name, kCFStringEncodingASCII);
  void *address = CFBundleGetFunctionPointerForName(bundle, symbol);
  CFRelease(symbol);
  return address;
}
