import {Platform} from 'react-native';
import Share from 'react-native-share';
import * as RNFS from 'react-native-fs';

import type {Recording} from '../../data/models';

export async function shareRecording(recording: Recording): Promise<void> {
  const localUri =
    typeof recording.localUri === 'string' ? recording.localUri.trim() : '';
  if (!localUri) {
    throw new Error('This recording does not have a valid local file URI.');
  }
  if (localUri.startsWith('content://')) {
    throw new Error(
      'This recording has an unsupported content URI and cannot be shared.',
    );
  }
  const filePath = localUri.startsWith('file://')
    ? localUri.slice('file://'.length)
    : localUri;
  if (!filePath.startsWith('/')) {
    throw new Error('This recording does not have a valid local file path.');
  }
  if (!(await RNFS.exists(filePath))) {
    throw new Error('The local video file is missing and cannot be shared.');
  }
  const fileInfo = await RNFS.stat(filePath);
  if (!fileInfo.isFile() || Number(fileInfo.size) <= 0) {
    throw new Error(
      'The local video file is empty or invalid and cannot be shared.',
    );
  }
  const extension = filePath.toLowerCase().endsWith('.mov') ? '.mov' : '.mp4';
  const safeName =
    recording.displayName
      .replace(/[\\/:*?"<>|]/g, '-')
      .trim()
      .slice(0, 100) || recording.id;
  const fileName = `${safeName}${extension}`;
  await Share.open({
    url: `file://${filePath}`,
    type: fileName.endsWith('.mov') ? 'video/quicktime' : 'video/mp4',
    filename: fileName,
    title: 'Share dashcam clip',
    failOnCancel: false,
    saveToFiles: Platform.OS === 'ios',
    useInternalStorage: true,
  });
}
