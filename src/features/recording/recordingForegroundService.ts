import {NativeModules, Platform} from 'react-native';

interface RecordingForegroundServiceModule {
  startRecordingService(recordAudio: boolean): Promise<void>;
  stopRecordingService(): Promise<void>;
}

const nativeModule = NativeModules
  .RoadwatchRecordingForegroundService as
  | RecordingForegroundServiceModule
  | undefined;

export async function startRecordingForegroundService(
  recordAudio: boolean,
): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (!nativeModule) {
    throw new Error(
      'Android background recording support is unavailable. Rebuild and reinstall the app.',
    );
  }
  await nativeModule.startRecordingService(recordAudio);
}

export async function stopRecordingForegroundService(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  if (!nativeModule) {
    throw new Error(
      'Android background recording support is unavailable. Rebuild and reinstall the app.',
    );
  }
  await nativeModule.stopRecordingService();
}
