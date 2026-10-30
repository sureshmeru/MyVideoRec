import * as RNFS from 'react-native-fs';
import Share from 'react-native-share';

import type {Recording} from '../src/data/models';
import {shareRecording} from '../src/features/storage/shareRecording';

jest.mock('react-native-fs', () => ({
  exists: jest.fn(),
  stat: jest.fn(),
}));

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: {open: jest.fn()},
}));

const filePath = '/data/user/0/com.myvideorec/files/recordings/clip.mp4';
const recording: Recording = {
  id: 'clip-1',
  displayName: 'Test clip',
  startTime: '2026-01-01T10:00:00.000Z',
  endTime: '2026-01-01T10:00:10.000Z',
  cameraId: 'back-camera',
  cameraPosition: 'back',
  width: 1920,
  height: 1080,
  frameRate: 30,
  durationSeconds: 10,
  fileSizeBytes: 1024,
  localUri: `file://${filePath}`,
  protected: false,
  gpsLatitude: null,
  gpsLongitude: null,
  uploadStatus: 'not-uploaded',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(RNFS.exists).mockResolvedValue(true);
  jest.mocked(RNFS.stat).mockResolvedValue({
    name: 'clip.mp4',
    path: filePath,
    size: 1024,
    mode: 0,
    ctime: 0,
    mtime: 0,
    originalFilepath: filePath,
    isFile: () => true,
    isDirectory: () => false,
  });
  jest.mocked(Share.open).mockResolvedValue({success: true, message: 'Shared'});
});

it('shares a validated recording using its canonical file URI and video MIME type', async () => {
  await shareRecording(recording);

  expect(RNFS.exists).toHaveBeenCalledWith(filePath);
  expect(RNFS.stat).toHaveBeenCalledWith(filePath);
  expect(Share.open).toHaveBeenCalledWith(
    expect.objectContaining({
      url: `file://${filePath}`,
      type: 'video/mp4',
      filename: 'Test clip.mp4',
      useInternalStorage: true,
    }),
  );
});

it('reports a missing video without opening the Android share sheet', async () => {
  jest.mocked(RNFS.exists).mockResolvedValue(false);

  await expect(shareRecording(recording)).rejects.toThrow(
    'The local video file is missing and cannot be shared.',
  );
  expect(Share.open).not.toHaveBeenCalled();
});
