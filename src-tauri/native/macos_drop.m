// Preserve Finder paths before WebKit delivers a DOM drop (File objects have no path).
// Native wry drag handling is disabled so links, text and OCR images reach the page too.
#import <Cocoa/Cocoa.h>
#import <objc/runtime.h>

typedef void (*md_paths_cb)(const char *label, const char *json);
static char labelKey;
static md_paths_cb pathsCallback;

static BOOL perform_drop(id view, SEL selector, id<NSDraggingInfo> info) {
  NSString *label = objc_getAssociatedObject(view, &labelKey);
  if (label && pathsCallback) {
    NSArray<NSURL *> *urls = [info.draggingPasteboard
        readObjectsForClasses:@[NSURL.class]
        options:@{NSPasteboardURLReadingFileURLsOnlyKey: @YES}];
    NSMutableArray<NSString *> *paths = [NSMutableArray array];
    for (NSURL *url in urls) {
      // Finder may supply file-reference URLs (file:///.file/id=...), not path URLs.
      NSString *path = url.isFileURL ? url.filePathURL.path : nil;
      if (path) [paths addObject:path];
    }
    // Publish even an empty list, clearing any paths left by an unhandled previous drop.
    NSData *json = [NSJSONSerialization dataWithJSONObject:paths options:0 error:NULL];
    NSString *text = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
    pathsCallback(label.UTF8String, text.UTF8String);
  }
  // Call wry/WebKit exactly once: it must still produce the DOM drop and its File objects.
  SEL original = NSSelectorFromString(@"miteiru_performDragOperation:");
  BOOL (*implementation)(id, SEL, id<NSDraggingInfo>) =
      (void *)[view methodForSelector:original];
  return implementation(view, selector, info);
}

// Called on the main thread after the WKWebView exists. Keep the original on the class so a
// second window installs only its own label and cannot wrap the handler recursively.
bool md_install(void *webview, const char *label, md_paths_cb callback) {
  id view = (__bridge id)webview;
  Class cls = object_getClass(view);
  SEL selector = @selector(performDragOperation:);
  Method method = class_getInstanceMethod(cls, selector);
  if (!method) return false;
  SEL original = NSSelectorFromString(@"miteiru_performDragOperation:");
  if (!class_getInstanceMethod(cls, original)) {
    class_addMethod(cls, original, method_getImplementation(method), method_getTypeEncoding(method));
    class_replaceMethod(cls, selector, (IMP)perform_drop, method_getTypeEncoding(method));
  }
  pathsCallback = callback;
  objc_setAssociatedObject(view, &labelKey, [NSString stringWithUTF8String:label], OBJC_ASSOCIATION_COPY_NONATOMIC);
  return true;
}
