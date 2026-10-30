export type CameraPosition = 'front' | 'back';

export interface Recording {
  id: string;
  displayName: string;
  startTime: string;
  endTime: string;
  cameraId: string;
  cameraPosition: CameraPosition;
  width: number;
  height: number;
  frameRate: number;
  durationSeconds: number;
  fileSizeBytes: number;
  localUri: string;
  protected: boolean;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  uploadStatus: 'not-uploaded' | 'queued' | 'uploading' | 'uploaded' | 'failed';
}

export interface Trip {
  id: string;
  startedAt: string;
  endedAt: string | null;
  distanceMeters: number;
}

export interface TripPoint {
  tripId: string;
  recordedAt: string;
  latitude: number;
  longitude: number;
  speedMps: number | null;
  accuracyMeters: number;
}
