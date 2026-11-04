#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>

@interface VideoCodecCapabilities : NSObject <RCTBridgeModule>
@end

@implementation VideoCodecCapabilities

RCT_EXPORT_MODULE(RoadwatchVideoCodecCapabilities)

RCT_REMAP_METHOD(getSupportedVideoCodecs,
                 width:(nonnull NSNumber *)width
                 height:(nonnull NSNumber *)height
                 frameRate:(nonnull NSNumber *)frameRate
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSMutableArray<NSString *> *codecs = [NSMutableArray new];
  NSArray<NSString *> *videoCodecs = @[AVVideoCodecTypeH264, AVVideoCodecTypeHEVC];
  for (NSString *codec in videoCodecs) {
    NSDictionary *settings = @{
      AVVideoCodecKey: codec,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: @{
        AVVideoExpectedSourceFrameRateKey: frameRate,
      },
    };
    if ([AVAssetWriterInput canApplyOutputSettings:settings forMediaType:AVMediaTypeVideo]) {
      [codecs addObject:[codec isEqualToString:AVVideoCodecTypeH264] ? @"h264" : @"h265"];
    }
  }
  resolve(codecs);
}

@end
