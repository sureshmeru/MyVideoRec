import type {Recording} from '../src/data/models';
import {selectCleanupCandidates} from '../src/features/storage/cleanupPolicy';

function recording(
  id: string,
  startTime: string,
  protectedClip = false,
  uploadStatus: Recording['uploadStatus'] = 'not-uploaded',
): Recording {
  return {
    id,
    displayName: id,
    startTime,
    endTime: startTime,
    cameraId: 'camera',
    cameraPosition: 'back',
    width: 1920,
    height: 1080,
    frameRate: 30,
    durationSeconds: 30,
    fileSizeBytes: 1024,
    localUri: `file://${id}.mp4`,
    protected: protectedClip,
    gpsLatitude: null,
    gpsLongitude: null,
    uploadStatus,
  };
}

describe('selectCleanupCandidates', () => {
  it('orders oldest first and excludes protected or transferring clips', () => {
    const clips = [
      recording('new', '2026-01-03T00:00:00.000Z'),
      recording('uploading', '2026-01-01T00:00:00.000Z', false, 'uploading'),
      recording('protected', '2026-01-02T00:00:00.000Z', true),
      recording('old', '2026-01-01T00:00:00.000Z'),
      recording('queued', '2025-12-31T00:00:00.000Z', false, 'queued'),
    ];

    expect(selectCleanupCandidates(clips).map(clip => clip.id)).toEqual(['old', 'new']);
  });
});
