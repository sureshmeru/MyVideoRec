import type {CameraDeviceFormat} from 'react-native-vision-camera';

import {
  getRecordingConfiguration,
  selectRecordingFormat,
} from '../src/features/recording/selectRecordingFormat';

function format(width: number, height: number, minFps: number, maxFps: number) {
  return {
    videoWidth: width,
    videoHeight: height,
    minFps,
    maxFps,
  } as CameraDeviceFormat;
}

describe('selectRecordingFormat', () => {
  it('selects a reported format near 1080p that supports 30 fps', () => {
    const requestedFormat = format(1920, 1080, 15, 30);
    const formats = [
      format(3840, 2160, 30, 60),
      requestedFormat,
      format(1280, 720, 30, 60),
    ];

    expect(selectRecordingFormat(formats, '1080p', 30)).toBe(requestedFormat);
  });

  it('chooses a supported resolution and frame rate when preferences are unavailable', () => {
    const availableFormat = format(1280, 720, 15, 24);
    expect(
      getRecordingConfiguration([availableFormat], '1080p', 30),
    ).toEqual({
      resolution: '720p',
      frameRate: 24,
      format: availableFormat,
    });
    expect(getRecordingConfiguration([], '1080p', 30)).toBeUndefined();
  });
});
