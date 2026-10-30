import {NativeModules, Platform} from 'react-native';

interface NativeCameraCapabilities {
  getConcurrentCameraPairs(): Promise<string[][]>;
}

export async function getConcurrentCameraPairs(): Promise<string[][]> {
  if (Platform.OS !== 'android') {
    return [];
  }

  const nativeModule = NativeModules
    .RoadwatchCameraCapabilities as NativeCameraCapabilities | undefined;
  if (!nativeModule) {
    throw new Error('Android camera capability module is unavailable. Rebuild the app.');
  }

  return nativeModule.getConcurrentCameraPairs();
}

export function supportsConcurrentFrontRear(
  cameraPairs: string[][],
  frontCameraId?: string,
  rearCameraId?: string,
): boolean {
  if (!frontCameraId || !rearCameraId) {
    return false;
  }

  return cameraPairs.some(
    cameraIds =>
      cameraIds.includes(frontCameraId) && cameraIds.includes(rearCameraId),
  );
}
