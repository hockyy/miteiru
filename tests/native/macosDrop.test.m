// Run on macOS with:
// clang -fobjc-arc -framework Cocoa src-tauri/native/macos_drop.m tests/native/macosDrop.test.m -o /tmp/miteiru-macos-drop-test
// /tmp/miteiru-macos-drop-test
#import <Cocoa/Cocoa.h>

typedef void (*md_paths_cb)(const char *, const char *);
extern bool md_install(void *, const char *, md_paths_cb);

@interface DropView : NSView
@property(nonatomic) NSUInteger calls;
- (BOOL)performDragOperation:(id<NSDraggingInfo>)info;
@end
@implementation DropView
- (BOOL)performDragOperation:(id<NSDraggingInfo>)info {
  self.calls++;
  return YES;
}
@end

@interface DragInfo : NSObject
@property(nonatomic, strong) NSPasteboard *draggingPasteboard;
@end
@implementation DragInfo
@end

static NSString *capturedLabel;
static NSArray *capturedPaths;
static void capture(const char *label, const char *json) {
  capturedLabel = [NSString stringWithUTF8String:label];
  capturedPaths = [NSJSONSerialization JSONObjectWithData:
      [[NSString stringWithUTF8String:json] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:NULL];
}

int main(void) {
  @autoreleasepool {
    DropView *first = [DropView new];
    DropView *second = [DropView new];
    NSCAssert(md_install((__bridge void *)first, "main", capture), @"installs the hook");
    NSCAssert(md_install((__bridge void *)second, "second", capture), @"installs once per class");
    NSCAssert(md_install((__bridge void *)first, "main", capture), @"repeated install is safe");
    DragInfo *info = [DragInfo new];
    info.draggingPasteboard = [NSPasteboard pasteboardWithUniqueName];
    NSArray *paths = @[@"/tmp/日本語 #100%.mp4", @"/tmp/subtitle.srt"];
    [info.draggingPasteboard writeObjects:@[
      [NSURL fileURLWithPath:paths[0]], [NSURL fileURLWithPath:paths[1]]
    ]];
    NSCAssert([first performDragOperation:(id)info], @"preserves WebKit's return value");
    NSCAssert(first.calls == 1, @"calls WebKit once");
    NSCAssert([capturedPaths isEqual:paths], @"captures all paths in order, without URL escaping");
    NSCAssert([capturedLabel isEqual:@"main"], @"identifies the receiving webview");
    [second performDragOperation:(id)info];
    NSCAssert(second.calls == 1 && [capturedLabel isEqual:@"second"], @"isolates window identity");

    NSString *temporary = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
    [@"fixture" writeToFile:temporary atomically:YES encoding:NSUTF8StringEncoding error:NULL];
    NSURL *reference = [NSURL fileURLWithPath:temporary].fileReferenceURL;
    NSCAssert(reference, @"creates Finder-style file reference");
    [info.draggingPasteboard clearContents];
    [info.draggingPasteboard writeObjects:@[reference]];
    [second performDragOperation:(id)info];
    NSCAssert([capturedPaths isEqual:@[reference.filePathURL.path]], @"resolves Finder's file-reference URLs");
    [[NSFileManager defaultManager] removeItemAtPath:temporary error:NULL];

    [info.draggingPasteboard clearContents];
    [info.draggingPasteboard writeObjects:@[[NSURL URLWithString:@"https://youtu.be/example"]]];
    [first performDragOperation:(id)info];
    NSCAssert(capturedPaths.count == 0 && first.calls == 2, @"links clear stale paths and reach WebKit");
    [info.draggingPasteboard clearContents];
    [info.draggingPasteboard setData:[NSData dataWithBytes:"png" length:3] forType:NSPasteboardTypePNG];
    [first performDragOperation:(id)info];
    NSCAssert(capturedPaths.count == 0 && first.calls == 3, @"images reach WebKit without stale file paths");
    [info.draggingPasteboard releaseGlobally];
    puts("PASS: native file paths, URL/image forwarding, repeated installation and window isolation");
  }
  return 0;
}
