import type {CameraDeviceFormat} from 'react-native-vision-camera';

export function selectRecordingFormat(
  formats: CameraDeviceFormat[],
): CameraDeviceFormat | undefined {
  if (formats.length === 0) {
    return undefined;
  }
  const supportedAtThirty = formats.filter(
    format => format.maxFps >= 30 && format.minFps <= 30,
  );
  const candidates = supportedAtThirty.length > 0 ? supportedAtThirty : formats;
  return [...candidates].sort((first, second) => {
    const firstDistance = Math.abs(first.videoWidth - 1920) + Math.abs(first.videoHeight - 1080);
    const secondDistance = Math.abs(second.videoWidth - 1920) + Math.abs(second.videoHeight - 1080);
    return firstDistance - secondDistance;
  })[0];
}
