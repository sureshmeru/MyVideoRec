import {NativeEventEmitter, NativeModules} from 'react-native';

import type {CameraTelemetrySample} from './cameraTelemetry';

interface CameraTelemetryNativeModule {
  startHeadingUpdates(): void;
  stopHeadingUpdates(): void;
  applyVideoOverlay(
    inputPath: string,
    outputPath: string,
    startTimeMs: number,
    samples: CameraTelemetrySample[],
  ): Promise<void>;
}

const nativeModule = NativeModules.RoadwatchCameraTelemetry as
  | CameraTelemetryNativeModule
  | undefined;

const eventEmitter = nativeModule
  ? new NativeEventEmitter(NativeModules.RoadwatchCameraTelemetry)
  : null;

export function startHeadingUpdates(): void {
  nativeModule?.startHeadingUpdates();
}

export function stopHeadingUpdates(): void {
  nativeModule?.stopHeadingUpdates();
}

export function subscribeToHeading(
  listener: (headingDegrees: number | null) => void,
): {remove: () => void} {
  return (
    eventEmitter?.addListener(
      'onCameraHeadingChanged',
      (event: {headingDegrees: number | null}) =>
        listener(event.headingDegrees),
    ) ?? {remove: () => {}}
  );
}

export function applyVideoOverlay(
  inputPath: string,
  outputPath: string,
  startTimeMs: number,
  samples: CameraTelemetrySample[],
): Promise<void> {
  if (!nativeModule) {
    return Promise.reject(
      new Error('The native camera telemetry module is unavailable.'),
    );
  }
  return nativeModule.applyVideoOverlay(
    inputPath,
    outputPath,
    startTimeMs,
    samples,
  );
}
