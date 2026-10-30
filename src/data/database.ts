import {enablePromise, openDatabase} from 'react-native-sqlite-storage';
import type {SQLiteDatabase} from 'react-native-sqlite-storage';

import {INITIAL_SCHEMA} from './migrations/001_initial';
import {SAFE_DELETION_SCHEMA} from './migrations/002_safe_deletion';
import {RECORDING_NAMES_SCHEMA} from './migrations/003_recording_names';
import type {Recording, Trip, TripPoint} from './models';

enablePromise(true);

let databasePromise: Promise<SQLiteDatabase> | undefined;
let initializationPromise: Promise<void> | undefined;

async function getDatabase(): Promise<SQLiteDatabase> {
  databasePromise ??= openDatabase({name: 'dashcam.db', location: 'default'});
  return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const database = await getDatabase();
      await database.executeSql('PRAGMA foreign_keys = ON');
      const [versionResult] = await database.executeSql('PRAGMA user_version');
      const version = Number(versionResult.rows.item(0).user_version);

      if (version < 1) {
        for (const statement of INITIAL_SCHEMA) {
          await database.executeSql(statement);
        }
        await database.executeSql('PRAGMA user_version = 1');
      }
      if (version < 2) {
        for (const statement of SAFE_DELETION_SCHEMA) {
          await database.executeSql(statement);
        }
        await database.executeSql('PRAGMA user_version = 2');
      }
      if (version < 3) {
        for (const statement of RECORDING_NAMES_SCHEMA) {
          await database.executeSql(statement);
        }
        await database.executeSql('PRAGMA user_version = 3');
      }
      await database.executeSql(
        'UPDATE trips SET ended_at = ? WHERE ended_at IS NULL',
        [new Date().toISOString()],
      );
    })().catch(error => {
      initializationPromise = undefined;
      databasePromise = undefined;
      throw error;
    });
  }
  await initializationPromise;
}

function mapRecording(row: Record<string, unknown>): Recording {
  return {
    id: String(row.id),
    displayName: String(row.display_name || row.id),
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    cameraId: String(row.camera_id),
    cameraPosition: row.camera_position === 'front' ? 'front' : 'back',
    width: Number(row.width),
    height: Number(row.height),
    frameRate: Number(row.frame_rate),
    durationSeconds: Number(row.duration_seconds),
    fileSizeBytes: Number(row.file_size_bytes),
    localUri: String(row.local_uri),
    protected: Number(row.is_protected) === 1,
    gpsLatitude: row.gps_latitude == null ? null : Number(row.gps_latitude),
    gpsLongitude: row.gps_longitude == null ? null : Number(row.gps_longitude),
    uploadStatus: row.upload_status as Recording['uploadStatus'],
  };
}

export async function listRecordings(): Promise<Recording[]> {
  await initializeDatabase();
  const database = await getDatabase();
  const [result] = await database.executeSql(
    'SELECT * FROM recordings ORDER BY start_time DESC',
  );
  const recordings: Recording[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    recordings.push(mapRecording(result.rows.item(index)));
  }
  return recordings;
}

export async function saveRecording(recording: Recording): Promise<void> {
  await initializeDatabase();
  const database = await getDatabase();
  await database.executeSql(
    `INSERT INTO recordings (
      id, display_name, start_time, end_time, camera_id, camera_position, width, height,
      frame_rate, duration_seconds, file_size_bytes, local_uri, is_protected,
      gps_latitude, gps_longitude, upload_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recording.id,
      recording.displayName,
      recording.startTime,
      recording.endTime,
      recording.cameraId,
      recording.cameraPosition,
      recording.width,
      recording.height,
      recording.frameRate,
      recording.durationSeconds,
      recording.fileSizeBytes,
      recording.localUri,
      recording.protected ? 1 : 0,
      recording.gpsLatitude,
      recording.gpsLongitude,
      recording.uploadStatus,
    ],
  );
}

export async function reserveRecordingForDeletion(recordingId: string): Promise<void> {
  await initializeDatabase();
  const database = await getDatabase();
  const [result] = await database.executeSql(
    `UPDATE recordings SET deletion_reserved = 1
     WHERE id = ? AND is_protected = 0 AND deletion_reserved = 0
       AND upload_status NOT IN ('queued', 'uploading')`,
    [recordingId],
  );
  if (result.rowsAffected !== 1) {
    throw new Error('Protected, transferring, reserved, or missing recordings cannot be deleted.');
  }
}

export async function releaseRecordingDeletion(recordingId: string): Promise<void> {
  await initializeDatabase();
  const database = await getDatabase();
  await database.executeSql(
    'UPDATE recordings SET deletion_reserved = 0 WHERE id = ? AND deletion_reserved = 1',
    [recordingId],
  );
}

export async function deleteReservedRecordingMetadata(recordingId: string): Promise<void> {
  await initializeDatabase();
  const database = await getDatabase();
  const [result] = await database.executeSql(
    'DELETE FROM recordings WHERE id = ? AND is_protected = 0 AND deletion_reserved = 1',
    [recordingId],
  );
  if (result.rowsAffected !== 1) {
    throw new Error('The reserved recording metadata could not be removed.');
  }
}

export async function setRecordingProtected(
  recordingId: string,
  isProtected: boolean,
): Promise<void> {
  await initializeDatabase();
  const database = await getDatabase();
  const [result] = await database.executeSql(
    'UPDATE recordings SET is_protected = ? WHERE id = ? AND deletion_reserved = 0',
    [isProtected ? 1 : 0, recordingId],
  );
  if (result.rowsAffected !== 1) {
    throw new Error('The recording is missing or is being deleted.');
  }
}

export async function renameRecording(
  recordingId: string,
  displayName: string,
): Promise<void> {
  const normalizedName = displayName.trim();
  const hasControlCharacters = [...normalizedName].some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!normalizedName || normalizedName.length > 120 || hasControlCharacters) {
    throw new Error('Clip names must contain 1–120 printable characters.');
  }
  await initializeDatabase();
  const database = await getDatabase();
  const [result] = await database.executeSql(
    'UPDATE recordings SET display_name = ? WHERE id = ? AND deletion_reserved = 0',
    [normalizedName, recordingId],
  );
  if (result.rowsAffected !== 1) {
    throw new Error('The recording is missing or is being deleted.');
  }
}

export async function createTrip(tripId: string, startedAt: string): Promise<void> {
  await initializeDatabase();
  const database = await getDatabase();
  await database.executeSql(
    'INSERT INTO trips (id, started_at, ended_at, distance_meters) VALUES (?, ?, NULL, 0)',
    [tripId, startedAt],
  );
}

export async function saveTripPoint(
  point: TripPoint,
  distanceIncrementMeters: number,
): Promise<void> {
  await initializeDatabase();
  const database = await getDatabase();
  await database.transaction(tx => {
    tx.executeSql(
      `INSERT INTO trip_points (
        trip_id, recorded_at, latitude, longitude, speed_mps, accuracy_m
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        point.tripId,
        point.recordedAt,
        point.latitude,
        point.longitude,
        point.speedMps,
        point.accuracyMeters,
      ],
    );
    tx.executeSql(
      'UPDATE trips SET distance_meters = distance_meters + ? WHERE id = ? AND ended_at IS NULL',
      [distanceIncrementMeters, point.tripId],
    );
  });
}

export async function finishTrip(tripId: string, endedAt: string): Promise<void> {
  await initializeDatabase();
  const database = await getDatabase();
  const [result] = await database.executeSql(
    'UPDATE trips SET ended_at = ? WHERE id = ? AND ended_at IS NULL',
    [endedAt, tripId],
  );
  if (result.rowsAffected !== 1) {
    throw new Error('The active trip could not be finalized.');
  }
}

export async function listTrips(): Promise<Trip[]> {
  await initializeDatabase();
  const database = await getDatabase();
  const [result] = await database.executeSql('SELECT * FROM trips ORDER BY started_at DESC');
  const trips: Trip[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    const row = result.rows.item(index);
    trips.push({
      id: String(row.id),
      startedAt: String(row.started_at),
      endedAt: row.ended_at == null ? null : String(row.ended_at),
      distanceMeters: Number(row.distance_meters),
    });
  }
  return trips;
}
