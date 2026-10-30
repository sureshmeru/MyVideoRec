import type {Recording} from '../../data/models';

export function selectCleanupCandidates(recordings: Recording[]): Recording[] {
  return recordings
    .filter(
      recording =>
        !recording.protected &&
        recording.uploadStatus !== 'queued' &&
        recording.uploadStatus !== 'uploading',
    )
    .sort((first, second) => first.startTime.localeCompare(second.startTime));
}
