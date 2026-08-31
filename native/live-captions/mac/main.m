#import <Foundation/Foundation.h>
#import <dlfcn.h>
#import <objc/message.h>
#import <objc/runtime.h>
#import <signal.h>
#import <stdio.h>
#import <stdlib.h>
#import <string.h>
#import <unistd.h>

static const long kSystemAudioSource = 1;
static const NSUInteger kMaxCaptionChars = 70;
static const NSUInteger kCaptionCharsToKeepAfterOverflow = 10;
static const NSUInteger kMaxCaptionWords = 12;

static CFRunLoopRef gRunLoop = NULL;
static id gEngine = nil;
static volatile sig_atomic_t gShouldStop = 0;
static NSUInteger gWindowStart = 0;

static void handleSignal(int sig) {
  (void)sig;
  gShouldStop = 1;
  if (gRunLoop) {
    CFRunLoopStop(gRunLoop);
  }
}

static void writeJSON(NSDictionary *payload) {
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:&error];
  if (!data) {
    fprintf(stderr, "json encode failed: %s\n", error ? [[error description] UTF8String] : "unknown");
    return;
  }
  fwrite(data.bytes, 1, data.length, stdout);
  fputc('\n', stdout);
  fflush(stdout);
}

static void writeMessage(NSString *type, NSString *message) {
  writeJSON(@{@"type": type, @"message": message ?: @""});
}

static void writeCaption(NSString *text) {
  writeJSON(@{@"type": @"caption", @"text": text ?: @""});
}

static NSString *normalizeSpaces(NSString *text) {
  NSArray<NSString *> *parts = [text componentsSeparatedByCharactersInSet:
      [NSCharacterSet whitespaceAndNewlineCharacterSet]];
  NSMutableArray<NSString *> *words = [NSMutableArray array];
  for (NSString *part in parts) {
    if (part.length > 0) {
      [words addObject:part];
    }
  }
  return [words componentsJoinedByString:@" "];
}

static NSString *extractCaptionWindow(NSString *rollingBuffer) {
  if (rollingBuffer.length == 0) {
    gWindowStart = 0;
    return @"";
  }

  if (gWindowStart > rollingBuffer.length) {
    gWindowStart = rollingBuffer.length;
  }

  if (rollingBuffer.length - gWindowStart > kMaxCaptionChars) {
    NSUInteger keepFrom = rollingBuffer.length > kCaptionCharsToKeepAfterOverflow
        ? rollingBuffer.length - kCaptionCharsToKeepAfterOverflow
        : 0;
    gWindowStart = keepFrom;
  }

  NSString *window = [[rollingBuffer substringFromIndex:gWindowStart]
      stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  NSArray<NSString *> *words = [window componentsSeparatedByString:@" "];
  NSMutableArray<NSString *> *nonEmpty = [NSMutableArray array];
  for (NSString *word in words) {
    if (word.length > 0) {
      [nonEmpty addObject:word];
    }
  }
  if (nonEmpty.count > kMaxCaptionWords) {
    NSRange range = NSMakeRange(nonEmpty.count - kMaxCaptionWords, kMaxCaptionWords);
    window = [[nonEmpty subarrayWithRange:range] componentsJoinedByString:@" "];
  }
  if (window.length > kMaxCaptionChars) {
    window = [[window substringFromIndex:window.length - kMaxCaptionChars]
        stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  }
  return window;
}

static NSString *captionText(id caption) {
  if ([caption respondsToSelector:@selector(text)]) {
    NSString *text = ((id (*)(id, SEL))objc_msgSend)(caption, @selector(text));
    if ([text isKindOfClass:[NSString class]] && text.length > 0) {
      return text;
    }
  }
  if ([caption respondsToSelector:@selector(caption)]) {
    NSString *text = ((id (*)(id, SEL))objc_msgSend)(caption, sel_registerName("caption"));
    if ([text isKindOfClass:[NSString class]]) {
      return text;
    }
  }
  return @"";
}

static BOOL stopEngine(void) {
  if (!gEngine) {
    return YES;
  }
  SEL stopSel = NSSelectorFromString(@"stop:error:");
  if (![gEngine respondsToSelector:stopSel]) {
    return NO;
  }
  NSError * __autoreleasing error = nil;
  NSError * __autoreleasing *errorPtr = &error;
  NSMethodSignature *sig = [gEngine methodSignatureForSelector:stopSel];
  NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
  [inv setTarget:gEngine];
  [inv setSelector:stopSel];
  long source = kSystemAudioSource;
  [inv setArgument:&source atIndex:2];
  [inv setArgument:&errorPtr atIndex:3];
  [inv invoke];
  BOOL ok = NO;
  [inv getReturnValue:&ok];
  return ok;
}

int main(int argc, const char *argv[]) {
  setvbuf(stdout, NULL, _IONBF, 0);
  setvbuf(stderr, NULL, _IONBF, 0);

  @autoreleasepool {
    writeMessage(@"debug", @"Helper process started.");

    void *handle = dlopen(
        "/System/Library/PrivateFrameworks/LiveTranscription.framework/LiveTranscription",
        RTLD_NOW);
    if (!handle) {
      writeMessage(@"error", [NSString stringWithFormat:@"Unable to load LiveTranscription: %s", dlerror()]);
      return 1;
    }

    Class cls = NSClassFromString(@"AXLiveCaptions");
    if (!cls) {
      writeMessage(@"error", @"AXLiveCaptions is unavailable on this macOS.");
      return 1;
    }

    if (argc > 1 && strcmp(argv[1], "--check") == 0) {
      writeMessage(@"state", @"supported");
      return 0;
    }

    id shared = ((id (*)(id, SEL))objc_msgSend)(cls, NSSelectorFromString(@"shared"));
    if (!shared) {
      writeMessage(@"error", @"AXLiveCaptions.shared returned nil.");
      return 1;
    }
    gEngine = shared;

    __block NSLocale *locale = nil;
    SEL localeSel = NSSelectorFromString(@"defaultLocaleWithCompletion:");
    if ([cls respondsToSelector:localeSel]) {
      void (^localeBlock)(NSLocale *) = ^(NSLocale *nextLocale) {
        locale = nextLocale;
      };
      ((void (*)(id, SEL, id))objc_msgSend)(cls, localeSel, localeBlock);
      NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:5.0];
      while (!locale && [deadline timeIntervalSinceNow] > 0) {
        [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                                 beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
      }
    }
    if (!locale) {
      locale = [NSLocale localeWithLocaleIdentifier:@"en_US"];
    }
    writeMessage(@"debug", [NSString stringWithFormat:@"Using locale %@", locale.localeIdentifier]);

    NSError * __autoreleasing startError = nil;
    NSError * __autoreleasing *startErrorPtr = &startError;
    SEL startSel = NSSelectorFromString(
        @"startWithSource:locale:sharedRoute:excludePIDs:error:transcriptionResult:");
    if (![shared respondsToSelector:startSel]) {
      writeMessage(@"error", @"AXLiveCaptions.startWithSource is unavailable.");
      return 1;
    }

    __block NSString *lastText = @"";
    void (^resultBlock)(id) = ^(id caption) {
      NSString *rolling = normalizeSpaces(captionText(caption));
      NSString *text = extractCaptionWindow(rolling);
      if ([text isEqualToString:lastText]) {
        return;
      }
      lastText = text;
      writeCaption(text);
    };

    NSMethodSignature *sig = [shared methodSignatureForSelector:startSel];
    NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
    [inv setTarget:shared];
    [inv setSelector:startSel];
    long source = kSystemAudioSource;
    BOOL sharedRoute = YES;
    id excludePIDs = nil;
    [inv setArgument:&source atIndex:2];
    [inv setArgument:&locale atIndex:3];
    [inv setArgument:&sharedRoute atIndex:4];
    [inv setArgument:&excludePIDs atIndex:5];
    [inv setArgument:&startErrorPtr atIndex:6];
    [inv setArgument:&resultBlock atIndex:7];
    [inv retainArguments];
    [inv invoke];

    BOOL started = NO;
    [inv getReturnValue:&started];
    if (!started) {
      writeMessage(@"error", startError.localizedDescription ?: @"Failed to start Mac Live Captions.");
      return 1;
    }

    writeMessage(@"state", @"started");
    writeMessage(@"debug", @"Streaming system-audio captions from AXLiveCaptions.");

    signal(SIGINT, handleSignal);
    signal(SIGTERM, handleSignal);

    gRunLoop = CFRunLoopGetCurrent();
    while (!gShouldStop) {
      [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode
                               beforeDate:[NSDate dateWithTimeIntervalSinceNow:0.25]];
    }

    stopEngine();
    writeMessage(@"state", @"stopped");
    return 0;
  }
}
