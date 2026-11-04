import type {CameraDeviceFormat} from 'react-native-vision-camera';

export type VideoResolution = '480p' | '720p' | '1080p' | '1440p' | '2160p';
export type VideoQuality = 'low' | 'medium' | 'high';
export type VideoCodec = 'h264' | 'h265';

export const VIDEO_RESOLUTIONS: Array<{
  id: VideoResolution;
  label: string;
  width: number;
  height: number;
}> = [
  {id: '480p', label: '480p', width: 640, height: 480},
  {id: '720p', label: '720p', width: 1280, height: 720},
  {id: '1080p', label: '1080p', width: 1920, height: 1080},
  {id: '1440p', label: '2K', width: 2560, height: 1440},
  {id: '2160p', label: '4K', width: 3840, height: 2160},
];

const QUALITY_BITRATES_MBPS: Record<
  VideoResolution,
  Record<VideoQuality, number>
> = {
  '480p': {low: 1.5, medium: 3, high: 5},
  '720p': {low: 3, medium: 5, high: 8},
  '1080p': {low: 6, medium: 10, high: 16},
  '1440p': {low: 12, medium: 20, high: 30},
  '2160p': {low: 25, medium: 40, high: 60},
};

function formatsForResolution(
  formats: CameraDeviceFormat[],
  resolution: VideoResolution,
): CameraDeviceFormat[] {
  const target = VIDEO_RESOLUTIONS.find(option => option.id === resolution);
  if (!target) {
    return [];
  }
  return formats.filter(
    format =>
      format.videoHeight === target.height && format.videoWidth >= target.width,
  );
}

export function getSupportedResolutions(
  formats: CameraDeviceFormat[],
): VideoResolution[] {
  return VIDEO_RESOLUTIONS.filter(option =>
    formatsForResolution(formats, option.id).some(format =>
      [24, 30, 60].some(
        frameRate => format.minFps <= frameRate && format.maxFps >= frameRate,
      ),
    ),
  ).map(option => option.id);
}

export function getSupportedFrameRates(
  formats: CameraDeviceFormat[],
  resolution: VideoResolution,
): number[] {
  const matchingFormats = formatsForResolution(formats, resolution);
  return [24, 30, 60].filter(frameRate =>
    matchingFormats.some(
      format => format.minFps <= frameRate && format.maxFps >= frameRate,
    ),
  );
}

export function selectRecordingFormat(
  formats: CameraDeviceFormat[],
  resolution: VideoResolution,
  frameRate: number,
): CameraDeviceFormat | undefined {
  const target = VIDEO_RESOLUTIONS.find(option => option.id === resolution);
  if (!target) {
    return undefined;
  }
  return formatsForResolution(formats, resolution)
    .filter(format => format.minFps <= frameRate && format.maxFps >= frameRate)
    .sort((first, second) => {
      const firstDistance =
        Math.abs(first.videoWidth - target.width) +
        Math.abs(first.videoHeight - target.height);
      const secondDistance =
        Math.abs(second.videoWidth - target.width) +
        Math.abs(second.videoHeight - target.height);
      return firstDistance - secondDistance;
    })[0];
}

export function getRecordingConfiguration(
  formats: CameraDeviceFormat[],
  preferredResolution: VideoResolution,
  preferredFrameRate: number,
):
  | {
      resolution: VideoResolution;
      frameRate: number;
      format: CameraDeviceFormat;
    }
  | undefined {
  const supportedResolutions = getSupportedResolutions(formats);
  const resolution = supportedResolutions.includes(preferredResolution)
    ? preferredResolution
    : getFallbackResolution(supportedResolutions, preferredResolution);
  if (!resolution) {
    return undefined;
  }
  const frameRates = getSupportedFrameRates(formats, resolution);
  const frameRate = frameRates.includes(preferredFrameRate)
    ? preferredFrameRate
    : getFallbackFrameRate(frameRates);
  if (frameRate === undefined) {
    return undefined;
  }
  const format = selectRecordingFormat(formats, resolution, frameRate);
  return format ? {resolution, frameRate, format} : undefined;
}

export function getFallbackResolution(
  supportedResolutions: VideoResolution[],
  preferred: VideoResolution = '1080p',
): VideoResolution | undefined {
  const preferredHeight =
    VIDEO_RESOLUTIONS.find(option => option.id === preferred)?.height ?? 1080;
  return [...supportedResolutions].sort((first, second) => {
    const firstHeight =
      VIDEO_RESOLUTIONS.find(option => option.id === first)?.height ?? 0;
    const secondHeight =
      VIDEO_RESOLUTIONS.find(option => option.id === second)?.height ?? 0;
    return (
      Math.abs(firstHeight - preferredHeight) -
      Math.abs(secondHeight - preferredHeight)
    );
  })[0];
}

export function getFallbackFrameRate(frameRates: number[]): number | undefined {
  return [...frameRates].sort(
    (first, second) => Math.abs(first - 30) - Math.abs(second - 30),
  )[0];
}

export function getVideoBitrateMbps(
  resolution: VideoResolution,
  quality: VideoQuality,
  customBitrateMbps: number | null,
): number {
  if (customBitrateMbps !== null) {
    return customBitrateMbps;
  }
  return QUALITY_BITRATES_MBPS[resolution][quality];
}

export function getEstimatedBytesPerMinute(bitrateMbps: number): number {
  return (bitrateMbps * 1_000_000 * 60) / 8;
}

export function getEstimatedBytesForDuration(
  bitrateMbps: number,
  durationSeconds: number,
): number {
  return getEstimatedBytesPerMinute(bitrateMbps) * (durationSeconds / 60);
}

export function getActualResolutionLabel(format: CameraDeviceFormat): string {
  return `${format.videoWidth} × ${format.videoHeight}`;
}
