import {NativeModules, Platform} from 'react-native';
import type {VideoCodec} from './videoSettings';

interface NativeCameraCapabilities {
  getConcurrentCameraPairs(): Promise<string[][]>;
}

interface NativeVideoCodecCapabilities {
  getSupportedVideoCodecs(
    width: number,
    height: number,
    frameRate: number,
  ): Promise<string[]>;
}

export async function getConcurrentCameraPairs(): Promise<string[][]> {
  if (Platform.OS !== 'android') {
    return [];
  }

  const nativeModule = NativeModules.RoadwatchCameraCapabilities as
    | NativeCameraCapabilities
    | undefined;
  if (!nativeModule) {
    throw new Error(
      'Android camera capability module is unavailable. Rebuild the app.',
    );
  }

  return nativeModule.getConcurrentCameraPairs();
}

export async function getSupportedVideoCodecs(
  width: number,
  height: number,
  frameRate: number,
): Promise<VideoCodec[]> {
  const moduleName =
    Platform.OS === 'android'
      ? 'RoadwatchCameraCapabilities'
      : 'RoadwatchVideoCodecCapabilities';
  const nativeModule = NativeModules[moduleName] as
    | NativeVideoCodecCapabilities
    | undefined;
  if (!nativeModule) {
    throw new Error(
      `${Platform.OS} video codec capability module is unavailable. Rebuild the app.`,
    );
  }
  const codecs = await nativeModule.getSupportedVideoCodecs(
    width,
    height,
    frameRate,
  );
  return codecs.filter(
    (codec): codec is VideoCodec => codec === 'h264' || codec === 'h265',
  );
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
