import * as RNFS from 'react-native-fs';

import {
  deleteReservedRecordingMetadata,
  listRecordings,
  releaseRecordingDeletion,
  reserveRecordingForDeletion,
} from '../../data/database';
import type {Recording} from '../../data/models';
import {selectCleanupCandidates} from './cleanupPolicy';

export async function deleteLocalRecording(recording: Recording): Promise<void> {
  if (recording.protected) {
    throw new Error('Protected recordings cannot be deleted.');
  }
  if (recording.uploadStatus === 'queued' || recording.uploadStatus === 'uploading') {
    throw new Error('A recording in a transfer queue cannot be deleted.');
  }

  await reserveRecordingForDeletion(recording.id);
  let fileRemoved = false;
  try {
    const path = recording.localUri.startsWith('file://')
      ? recording.localUri.slice('file://'.length)
      : recording.localUri;
    if (!(await RNFS.exists(path))) {
      throw new Error('The video file is missing. Its library entry was kept for diagnosis.');
    }
    await RNFS.unlink(path);
    fileRemoved = true;
    await deleteReservedRecordingMetadata(recording.id);
  } catch (error) {
    try {
      await releaseRecordingDeletion(recording.id);
    } catch (releaseError) {
      const releaseMessage =
        releaseError instanceof Error ? releaseError.message : 'The deletion lock could not be released.';
      const originalMessage =
        error instanceof Error ? error.message : 'The video could not be deleted.';
      throw new Error(`${originalMessage} ${releaseMessage}`);
    }
    if (fileRemoved) {
      const message =
        error instanceof Error ? error.message : 'The local file was removed, but metadata cleanup failed.';
      throw new Error(`The video file was removed but its library metadata could not be deleted: ${message}`);
    }
    throw error;
  }
}

export async function cleanupOldestRecordingsUntil(
  targetFreeBytes: number,
): Promise<boolean> {
  let freeBytes = (await RNFS.getFSInfo()).freeSpace;
  if (freeBytes >= targetFreeBytes) {
    return true;
  }

  const candidates = selectCleanupCandidates(await listRecordings());
  for (const recording of candidates) {
    if (freeBytes >= targetFreeBytes) {
      return true;
    }
    await deleteLocalRecording(recording);
    freeBytes = (await RNFS.getFSInfo()).freeSpace;
  }
  return freeBytes >= targetFreeBytes;
}
