#import <AVFoundation/AVFoundation.h>
#import <CoreLocation/CoreLocation.h>
#import <QuartzCore/QuartzCore.h>
#import <React/RCTEventEmitter.h>
#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface CameraTelemetry : RCTEventEmitter <RCTBridgeModule, CLLocationManagerDelegate>
@property(nonatomic, strong) CLLocationManager *locationManager;
@end

@implementation CameraTelemetry

RCT_EXPORT_MODULE(RoadwatchCameraTelemetry)

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"onCameraHeadingChanged"];
}

RCT_EXPORT_METHOD(startHeadingUpdates)
{
  if (![CLLocationManager headingAvailable]) {
    [self sendEventWithName:@"onCameraHeadingChanged" body:@{@"headingDegrees" : [NSNull null]}];
    return;
  }
  if (self.locationManager == nil) {
    self.locationManager = [CLLocationManager new];
    self.locationManager.delegate = self;
    self.locationManager.headingFilter = 2.0;
  }
  [self.locationManager startUpdatingHeading];
}

RCT_EXPORT_METHOD(stopHeadingUpdates)
{
  [self.locationManager stopUpdatingHeading];
}

- (void)locationManager:(CLLocationManager *)manager didUpdateHeading:(CLHeading *)newHeading
{
  CLLocationDirection heading = newHeading.trueHeading >= 0
      ? newHeading.trueHeading
      : newHeading.magneticHeading;
  if (heading < 0 || !isfinite(heading)) {
    [self sendEventWithName:@"onCameraHeadingChanged" body:@{@"headingDegrees" : [NSNull null]}];
    return;
  }
  [self sendEventWithName:@"onCameraHeadingChanged"
                     body:@{@"headingDegrees" : @(fmod(heading, 360.0))}];
}

RCT_REMAP_METHOD(applyVideoOverlay,
                 applyVideoOverlayWithInputPath:(NSString *)inputPath
                 outputPath:(NSString *)outputPath
                 startTimeMs:(nonnull NSNumber *)startTimeMs
                 samples:(NSArray<NSDictionary *> *)samples
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *inputURL = [NSURL fileURLWithPath:inputPath];
  NSURL *outputURL = [NSURL fileURLWithPath:outputPath];
  AVURLAsset *asset = [AVURLAsset URLAssetWithURL:inputURL options:nil];
  AVAssetTrack *sourceVideoTrack = [[asset tracksWithMediaType:AVMediaTypeVideo] firstObject];
  if (sourceVideoTrack == nil) {
    reject(@"VIDEO_OVERLAY_INPUT", @"The source video has no video track.", nil);
    return;
  }

  NSError *compositionError = nil;
  AVMutableComposition *composition = [AVMutableComposition composition];
  CMTime videoDuration = sourceVideoTrack.timeRange.duration;
  CMTimeRange videoSourceRange = sourceVideoTrack.timeRange;
  AVMutableCompositionTrack *videoTrack =
      [composition addMutableTrackWithMediaType:AVMediaTypeVideo
                               preferredTrackID:kCMPersistentTrackID_Invalid];
  if (![videoTrack insertTimeRange:videoSourceRange ofTrack:sourceVideoTrack atTime:kCMTimeZero error:&compositionError]) {
    reject(@"VIDEO_OVERLAY_COMPOSITION", @"Could not prepare the video for overlay processing.", compositionError);
    return;
  }
  AVAssetTrack *sourceAudioTrack = [[asset tracksWithMediaType:AVMediaTypeAudio] firstObject];
  if (sourceAudioTrack != nil) {
    CMTime audioDuration = sourceAudioTrack.timeRange.duration;
    if (CMTimeCompare(audioDuration, videoDuration) > 0) {
      audioDuration = videoDuration;
    }
    CMTimeRange audioSourceRange = CMTimeRangeMake(sourceAudioTrack.timeRange.start, audioDuration);
    AVMutableCompositionTrack *audioTrack =
        [composition addMutableTrackWithMediaType:AVMediaTypeAudio
                                 preferredTrackID:kCMPersistentTrackID_Invalid];
    if (![audioTrack insertTimeRange:audioSourceRange ofTrack:sourceAudioTrack atTime:kCMTimeZero error:&compositionError]) {
      reject(@"VIDEO_OVERLAY_COMPOSITION", @"Could not preserve the recorded audio.", compositionError);
      return;
    }
  }

  CGRect naturalBounds = CGRectMake(0, 0, sourceVideoTrack.naturalSize.width, sourceVideoTrack.naturalSize.height);
  CGRect transformedBounds = CGRectApplyAffineTransform(naturalBounds, sourceVideoTrack.preferredTransform);
  CGSize renderSize = CGSizeMake(fabs(transformedBounds.size.width), fabs(transformedBounds.size.height));
  if (renderSize.width <= 0 || renderSize.height <= 0) {
    reject(@"VIDEO_OVERLAY_SIZE", @"The recorded video has invalid dimensions.", nil);
    return;
  }
  CGAffineTransform normalizedTransform = sourceVideoTrack.preferredTransform;
  normalizedTransform.tx -= CGRectGetMinX(transformedBounds);
  normalizedTransform.ty -= CGRectGetMinY(transformedBounds);
  AVMutableVideoCompositionInstruction *instruction =
      [AVMutableVideoCompositionInstruction videoCompositionInstruction];
  instruction.timeRange = CMTimeRangeMake(kCMTimeZero, videoDuration);
  AVMutableVideoCompositionLayerInstruction *layerInstruction =
      [AVMutableVideoCompositionLayerInstruction videoCompositionLayerInstructionWithAssetTrack:videoTrack];
  [layerInstruction setTransform:normalizedTransform atTime:kCMTimeZero];
  instruction.layerInstructions = @[layerInstruction];

  AVMutableVideoComposition *videoComposition = [AVMutableVideoComposition videoComposition];
  videoComposition.instructions = @[instruction];
  videoComposition.renderSize = renderSize;
  videoComposition.frameDuration = CMTimeMake(1, MAX(1, (int32_t)round(sourceVideoTrack.nominalFrameRate)));

  CALayer *parentLayer = [CALayer layer];
  parentLayer.frame = CGRectMake(0, 0, renderSize.width, renderSize.height);
  parentLayer.masksToBounds = YES;
  parentLayer.beginTime = AVCoreAnimationBeginTimeAtZero;
  CALayer *videoLayer = [CALayer layer];
  videoLayer.frame = parentLayer.bounds;
  [parentLayer addSublayer:videoLayer];
  [self addTelemetryLayersTo:parentLayer
                   renderSize:renderSize
                 startTimeMs:startTimeMs.doubleValue
                     samples:samples
                    duration:CMTimeGetSeconds(videoDuration)];
  videoComposition.animationTool =
      [AVVideoCompositionCoreAnimationTool videoCompositionCoreAnimationToolWithPostProcessingAsVideoLayer:videoLayer
                                                                                                 inLayer:parentLayer];

  if ([[NSFileManager defaultManager] fileExistsAtPath:outputPath]) {
    if (![[NSFileManager defaultManager] removeItemAtURL:outputURL error:&compositionError]) {
      reject(@"VIDEO_OVERLAY_OUTPUT", @"Could not prepare the output video file.", compositionError);
      return;
    }
  }
  AVAssetExportSession *exportSession =
      [[AVAssetExportSession alloc] initWithAsset:composition presetName:AVAssetExportPresetHighestQuality];
  if (exportSession == nil) {
    reject(@"VIDEO_OVERLAY_EXPORT", @"Could not create the video overlay exporter.", nil);
    return;
  }
  exportSession.videoComposition = videoComposition;
  exportSession.outputURL = outputURL;
  exportSession.outputFileType = AVFileTypeQuickTimeMovie;
  exportSession.shouldOptimizeForNetworkUse = NO;
  [exportSession exportAsynchronouslyWithCompletionHandler:^{
    switch (exportSession.status) {
      case AVAssetExportSessionStatusCompleted:
        resolve(nil);
        break;
      case AVAssetExportSessionStatusCancelled:
        [[NSFileManager defaultManager] removeItemAtURL:outputURL error:nil];
        reject(@"VIDEO_OVERLAY_CANCELLED", @"Video overlay processing was cancelled.", exportSession.error);
        break;
      default:
        [[NSFileManager defaultManager] removeItemAtURL:outputURL error:nil];
        reject(@"VIDEO_OVERLAY_FAILED", @"Could not burn telemetry into the recorded video.", exportSession.error);
        break;
    }
  }];
}

- (void)addTelemetryLayersTo:(CALayer *)parentLayer
                  renderSize:(CGSize)renderSize
                startTimeMs:(double)startTimeMs
                    samples:(NSArray<NSDictionary *> *)samples
                   duration:(double)duration
{
  if (duration <= 0) {
    return;
  }
  CGFloat scale = renderSize.width / 1080.0;
  CGFloat margin = 30.0 * scale;
  CGFloat fontSize = 31.0 * scale;
  NSMutableArray<NSNumber *> *offsets = [NSMutableArray arrayWithObject:@0];
  for (NSDictionary *sample in samples) {
    NSNumber *timestamp = sample[@"timestampMs"];
    if (![timestamp isKindOfClass:[NSNumber class]]) {
      continue;
    }
    double offset = (timestamp.doubleValue - startTimeMs) / 1000.0;
    if (offset > 0 && offset < duration) {
      [offsets addObject:@(offset)];
    }
  }
  [offsets addObject:@(duration)];
  [offsets sortUsingSelector:@selector(compare:)];
  NSMutableArray<NSNumber *> *timeline = [NSMutableArray array];
  for (NSNumber *offset in offsets) {
    if (timeline.count == 0 || fabs(timeline.lastObject.doubleValue - offset.doubleValue) > 0.001) {
      [timeline addObject:offset];
    }
  }
  NSMutableArray<NSNumber *> *keyTimes = [NSMutableArray array];
  NSMutableArray<NSString *> *labels = [NSMutableArray array];
  NSMutableArray<NSNumber *> *headings = [NSMutableArray array];
  NSDateFormatter *formatter = [NSDateFormatter new];
  formatter.locale = [NSLocale currentLocale];
  formatter.timeZone = [NSTimeZone localTimeZone];
  formatter.dateFormat = @"HH:mm:ss | dd/MM/yyyy";

  for (NSNumber *offset in timeline) {
    double timestamp = startTimeMs + offset.doubleValue * 1000.0;
    NSDictionary *sample = [self sampleAt:timestamp samples:samples];
    double speed = [sample[@"speedKph"] isKindOfClass:[NSNumber class]]
        ? [sample[@"speedKph"] doubleValue]
        : -1;
    NSString *speedText = isfinite(speed) && speed >= 0 && speed <= 198
        ? [NSString stringWithFormat:@"%.0f", round(speed)]
        : @"--";
    [labels addObject:[NSString stringWithFormat:@"%@ | %@ KMPH",
                       [formatter stringFromDate:[NSDate dateWithTimeIntervalSince1970:timestamp / 1000.0]],
                       speedText]];
    double heading = [sample[@"headingDegrees"] isKindOfClass:[NSNumber class]]
        ? [sample[@"headingDegrees"] doubleValue]
        : -1;
    [headings addObject:@(isfinite(heading) && heading >= 0 && heading < 360 ? heading : 0)];
    [keyTimes addObject:@(offset.doubleValue / duration)];
  }

  CGFloat footerHeight = fontSize * 2.0;
  CGFloat footerWidth = renderSize.width - margin * 2.0;
  CALayer *footerBackground = [CALayer layer];
  footerBackground.frame = CGRectMake(margin,
                                      renderSize.height - margin - footerHeight - margin * 0.4,
                                      footerWidth,
                                      footerHeight + margin * 0.4);
  footerBackground.backgroundColor = [[UIColor colorWithWhite:0 alpha:0.72] CGColor];
  footerBackground.cornerRadius = 12.0 * scale;
  [parentLayer addSublayer:footerBackground];

  for (NSUInteger index = 0; index + 1 < timeline.count; index++) {
    double begin = timeline[index].doubleValue;
    double interval = timeline[index + 1].doubleValue - begin;
    if (interval <= 0) {
      continue;
    }
    CATextLayer *footer = [CATextLayer layer];
    footer.frame = CGRectInset(footerBackground.frame, 10.0 * scale, 4.0 * scale);
    footer.alignmentMode = kCAAlignmentCenter;
    footer.foregroundColor = UIColor.whiteColor.CGColor;
    footer.font = (__bridge CFTypeRef)[UIFont boldSystemFontOfSize:fontSize];
    footer.fontSize = fontSize;
    footer.contentsScale = UIScreen.mainScreen.scale;
    footer.string = labels[index];
    CAKeyframeAnimation *visibility = [CAKeyframeAnimation animationWithKeyPath:@"opacity"];
    visibility.values = @[@0, @1, @1, @0];
    visibility.keyTimes = @[@0, @0.001, @0.999, @1];
    visibility.duration = interval;
    visibility.beginTime = AVCoreAnimationBeginTimeAtZero + begin;
    visibility.fillMode = kCAFillModeBoth;
    visibility.removedOnCompletion = NO;
    [footer addAnimation:visibility forKey:@"telemetryTextVisibility"];
    [parentLayer addSublayer:footer];
  }

  CGFloat compassDiameter = 92.0 * scale;
  CGRect compassFrame = CGRectMake(margin, margin, compassDiameter, compassDiameter);
  CAShapeLayer *compass = [CAShapeLayer layer];
  compass.frame = compassFrame;
  compass.path = [UIBezierPath bezierPathWithOvalInRect:compass.bounds].CGPath;
  compass.fillColor = [[UIColor colorWithWhite:0 alpha:0.72] CGColor];
  compass.strokeColor = UIColor.whiteColor.CGColor;
  compass.lineWidth = 2.0 * scale;
  [parentLayer addSublayer:compass];

  CAShapeLayer *needle = [CAShapeLayer layer];
  needle.bounds = CGRectMake(0, 0, compassDiameter * 0.28, compassDiameter * 0.66);
  needle.position = CGPointMake(CGRectGetMidX(compassFrame), CGRectGetMidY(compassFrame));
  UIBezierPath *needlePath = [UIBezierPath bezierPath];
  [needlePath moveToPoint:CGPointMake(CGRectGetMidX(needle.bounds), 0)];
  [needlePath addLineToPoint:CGPointMake(CGRectGetMaxX(needle.bounds), CGRectGetMaxY(needle.bounds) * 0.76)];
  [needlePath addLineToPoint:CGPointMake(CGRectGetMidX(needle.bounds), CGRectGetMaxY(needle.bounds) * 0.6)];
  [needlePath addLineToPoint:CGPointMake(CGRectGetMinX(needle.bounds), CGRectGetMaxY(needle.bounds) * 0.76)];
  [needlePath closePath];
  needle.path = needlePath.CGPath;
  needle.fillColor = [UIColor systemRedColor].CGColor;
  [parentLayer addSublayer:needle];
  NSMutableArray<NSNumber *> *rotationValues = [NSMutableArray array];
  NSMutableArray<NSNumber *> *needleVisibility = [NSMutableArray array];
  for (NSNumber *heading in headings) {
    [rotationValues addObject:@(-heading.doubleValue * M_PI / 180.0)];
  }
  for (NSNumber *offset in timeline) {
    NSDictionary *sample = [self sampleAt:startTimeMs + offset.doubleValue * 1000.0
                                   samples:samples];
    double heading = [sample[@"headingDegrees"] isKindOfClass:[NSNumber class]]
        ? [sample[@"headingDegrees"] doubleValue]
        : -1;
    [needleVisibility addObject:@(isfinite(heading) && heading >= 0 && heading < 360 ? 1 : 0)];
  }
  [self addKeyframe:needle
            keyPath:@"transform.rotation.z"
             values:rotationValues
           keyTimes:keyTimes
           duration:duration];
  [self addKeyframe:needle
            keyPath:@"opacity"
             values:needleVisibility
           keyTimes:keyTimes
           duration:duration];
}

- (NSDictionary *)sampleAt:(double)timestampMs samples:(NSArray<NSDictionary *> *)samples
{
  NSDictionary *latest = @{};
  for (NSDictionary *sample in samples) {
    NSNumber *timestamp = sample[@"timestampMs"];
    if (![timestamp isKindOfClass:[NSNumber class]] || timestamp.doubleValue > timestampMs) {
      break;
    }
    latest = sample;
  }
  return latest;
}

- (void)addKeyframe:(CALayer *)layer
            keyPath:(NSString *)keyPath
             values:(NSArray *)values
           keyTimes:(NSArray<NSNumber *> *)keyTimes
           duration:(double)duration
{
  if (values.count == 0 || values.count != keyTimes.count) {
    return;
  }
  CAKeyframeAnimation *animation = [CAKeyframeAnimation animationWithKeyPath:keyPath];
  animation.values = values;
  animation.keyTimes = keyTimes;
  animation.calculationMode = kCAAnimationDiscrete;
  animation.duration = duration;
  animation.beginTime = AVCoreAnimationBeginTimeAtZero;
  animation.fillMode = kCAFillModeForwards;
  animation.removedOnCompletion = NO;
  [layer addAnimation:animation forKey:keyPath];
}

@end
