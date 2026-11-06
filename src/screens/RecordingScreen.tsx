import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AppState,
  AppStateStatus,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import type {VideoFile} from 'react-native-vision-camera';
import Geolocation from '@react-native-community/geolocation';
import * as RNFS from 'react-native-fs';
import {useQueryClient} from '@tanstack/react-query';
import Svg, {Circle, Path, Rect, Text as SvgText} from 'react-native-svg';

import {colors, spacing} from '../app/theme';
import {DetectionOverlay} from '../components/DetectionOverlay';
import {Screen} from '../components/Screen';
import {StatusBadge} from '../components/UI';
import {saveRecording} from '../data/database';
import type {CameraPosition, Recording, TripPoint} from '../data/models';
import {useVehicleDetector} from '../features/ai/useVehicleDetector';
import {requestForegroundLocationPermission} from '../features/trips/locationPermissions';
import {
  formatHeading,
  formatSpeed,
  getCardinalDirection,
  resolveCameraSpeedKph,
} from '../features/recording/cameraTelemetry';
import type {CameraTelemetrySample} from '../features/recording/cameraTelemetry';
import {
  applyVideoOverlay,
  startHeadingUpdates,
  stopHeadingUpdates,
  subscribeToHeading,
} from '../features/recording/cameraTelemetryNative';
import {useSettingsStore} from '../features/recording/settingsStore';
import type {SpeedUnit} from '../features/recording/settingsStore';
import {getRecordingConfiguration} from '../features/recording/selectRecordingFormat';
import {useRecordingStore} from '../features/recording/recordingStore';
import {cleanupOldestRecordingsUntil} from '../features/storage/recordingFileService';
import {useTripStore} from '../features/trips/tripStore';
import {
  startRecordingForegroundService,
  stopRecordingForegroundService,
} from '../features/recording/recordingForegroundService';
import {
  getConcurrentCameraPairs,
  supportsConcurrentFrontRear,
} from '../features/recording/cameraCapabilities';

const LOW_SPACE_LIMIT_BYTES = 512 * 1024 * 1024;
const RECORDINGS_DIRECTORY = `${RNFS.DocumentDirectoryPath}/recordings`;

interface FinalizedCameraSegment {
  video: VideoFile;
  cameraId: string;
  cameraPosition: CameraPosition;
  frameRate: number;
  startedAtMs: number;
  telemetrySamples: CameraTelemetrySample[];
  speedUnit: SpeedUnit;
}

export function RecordingScreen() {
  const cameraRef = useRef<Camera>(null);
  const frontCameraRef = useRef<Camera>(null);
  const rearCameraRef = useRef<Camera>(null);
  const activeRef = useRef(false);
  const startInProgressRef = useRef(false);
  const cameraPermissionRequestStartedRef = useRef(false);
  const dualRecordingRef = useRef(false);
  const expectedSegmentsRef = useRef(0);
  const finalizedSegmentsRef = useRef<FinalizedCameraSegment[]>([]);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const locationWatchIdRef = useRef<number | null>(null);
  const lastLocationRef = useRef<TripPoint | null>(null);
  const latestHeadingRef = useRef<number | null>(null);
  const latestSpeedRef = useRef<number | null>(null);
  const telemetrySamplesRef = useRef<CameraTelemetrySample[]>([]);
  const startSegmentRef = useRef<() => Promise<void>>(async () => {});
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState,
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [microphoneGranted, setMicrophoneGranted] = useState(false);
  const [dualCaptureEnabled, setDualCaptureEnabled] = useState(false);
  const [concurrentCameraPairs, setConcurrentCameraPairs] = useState<
    string[][]
  >([]);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [headingDegrees, setHeadingDegrees] = useState<number | null>(null);
  const [speedKph, setSpeedKph] = useState<number | null>(null);
  const [compassExpanded, setCompassExpanded] = useState(false);
  const [clockTimestampMs, setClockTimestampMs] = useState(Date.now());
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const cameraPosition = useSettingsStore(state => state.cameraPosition);
  const speedUnit = useSettingsStore(state => state.speedUnit);
  const setCameraPosition = useSettingsStore(state => state.setCameraPosition);
  const audioEnabled = useSettingsStore(state => state.audioEnabled);
  const segmentSeconds = useSettingsStore(state => state.segmentSeconds);
  const loopCleanupEnabled = useSettingsStore(
    state => state.loopCleanupEnabled,
  );
  const videoResolution = useSettingsStore(state => state.videoResolution);
  const frameRate = useSettingsStore(state => state.frameRate);
  const status = useRecordingStore(state => state.status);
  const elapsedSeconds = useRecordingStore(state => state.elapsedSeconds);
  const recordingError = useRecordingStore(state => state.error);
  const currentTripPoint = useTripStore(state => state.currentPoint);
  const setStatus = useRecordingStore(state => state.setStatus);
  const setError = useRecordingStore(state => state.setError);
  const setElapsedSeconds = useRecordingStore(state => state.setElapsedSeconds);
  const device = useCameraDevice(cameraPosition);
  const frontDevice = useCameraDevice('front');
  const rearDevice = useCameraDevice('back');
  const {
    hasPermission: hasCameraPermission,
    requestPermission: requestCameraPermission,
  } = useCameraPermission();
  const {
    hasPermission: hasMicrophonePermission,
    requestPermission: requestMicrophonePermission,
  } = useMicrophonePermission();

  useEffect(() => {
    if (
      !isFocused ||
      hasCameraPermission ||
      cameraPermissionRequestStartedRef.current
    ) {
      return;
    }

    cameraPermissionRequestStartedRef.current = true;
    requestCameraPermission()
      .then(granted => {
        if (!granted) {
          setCameraError(
            'Camera permission is needed for the live preview. Allow access to continue.',
          );
        }
      })
      .catch(error => {
        setCameraError(
          error instanceof Error
            ? error.message
            : 'Camera permission request failed.',
        );
      });
  }, [hasCameraPermission, isFocused, requestCameraPermission]);

  const recordingConfiguration = useMemo(
    () =>
      getRecordingConfiguration(
        device?.formats ?? [],
        videoResolution,
        frameRate,
      ),
    [device?.formats, frameRate, videoResolution],
  );
  const format = recordingConfiguration?.format;
  const selectedFps = recordingConfiguration?.frameRate ?? frameRate;
  const frontRecordingConfiguration = useMemo(
    () =>
      getRecordingConfiguration(
        frontDevice?.formats ?? [],
        videoResolution,
        frameRate,
      ),
    [frontDevice?.formats, frameRate, videoResolution],
  );
  const frontFormat = frontRecordingConfiguration?.format;
  const frontFps = frontRecordingConfiguration?.frameRate ?? frameRate;
  const rearRecordingConfiguration = useMemo(
    () =>
      getRecordingConfiguration(
        rearDevice?.formats ?? [],
        videoResolution,
        frameRate,
      ),
    [frameRate, rearDevice?.formats, videoResolution],
  );
  const rearFormat = rearRecordingConfiguration?.format;
  const rearFps = rearRecordingConfiguration?.frameRate ?? frameRate;
  const dualCaptureSupported = supportsConcurrentFrontRear(
    concurrentCameraPairs,
    frontDevice?.id,
    rearDevice?.id,
  );
  const roadCameraAvailable =
    dualCaptureEnabled && dualCaptureSupported
      ? Boolean(rearDevice && rearFormat)
      : cameraPosition === 'back';
  const vehicleDetector = useVehicleDetector(roadCameraAvailable);

  useEffect(() => {
    const timer = setInterval(() => setClockTimestampMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isFocused && !activeRef.current) {
      return;
    }
    startHeadingUpdates();
    const subscription = subscribeToHeading(value => {
      const validHeading =
        value !== null && Number.isFinite(value) && value >= 0 && value < 360
          ? value
          : null;
      latestHeadingRef.current = validHeading;
      setHeadingDegrees(validHeading);
    });
    return () => {
      subscription.remove();
      stopHeadingUpdates();
    };
  }, [isFocused]);

  const stopLocationUpdates = useCallback(() => {
    if (locationWatchIdRef.current !== null) {
      Geolocation.clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
    }
    lastLocationRef.current = null;
  }, []);

  const startLocationUpdates = useCallback(async () => {
    const permissionGranted = await requestForegroundLocationPermission();
    if (!permissionGranted) {
      setSpeedKph(null);
      latestSpeedRef.current = null;
      setTelemetryError(
        'Allow location access to include GPS speed in recordings.',
      );
      return false;
    }
    if (
      Platform.OS === 'android' &&
      !(await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ))
    ) {
      setSpeedKph(null);
      latestSpeedRef.current = null;
      setTelemetryError(
        'Precise location is required for GPS speed. Change this app’s location permission to Precise.',
      );
      return false;
    }

    setTelemetryError('Waiting for a GPS fix…');
    if (locationWatchIdRef.current !== null) {
      return true;
    }

    locationWatchIdRef.current = Geolocation.watchPosition(
      position => {
        const accuracyMeters = position.coords.accuracy;
        if (
          !Number.isFinite(accuracyMeters) ||
          accuracyMeters < 0 ||
          !Number.isFinite(position.coords.latitude) ||
          !Number.isFinite(position.coords.longitude) ||
          !Number.isFinite(position.timestamp)
        ) {
          return;
        }
        const currentPoint: TripPoint = {
          tripId: 'camera-overlay',
          recordedAt: new Date(position.timestamp).toISOString(),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speedMps: null,
          accuracyMeters,
        };
        const providerSpeed = position.coords.speed;
        const nextSpeedKph = resolveCameraSpeedKph(
          providerSpeed,
          accuracyMeters,
          lastLocationRef.current,
          currentPoint,
        );
        const previousTimestamp = lastLocationRef.current
          ? new Date(lastLocationRef.current.recordedAt).getTime()
          : null;
        if (
          accuracyMeters <= 20 &&
          (nextSpeedKph !== null ||
            previousTimestamp === null ||
            position.timestamp - previousTimestamp >= 10_000)
        ) {
          lastLocationRef.current = currentPoint;
        }
        latestSpeedRef.current = nextSpeedKph;
        setSpeedKph(nextSpeedKph);
        setTelemetryError(
          nextSpeedKph !== null
            ? null
            : accuracyMeters > 30
            ? 'Waiting for a precise GPS fix. Enable Precise location and device location.'
            : 'GPS is active; waiting for a reliable speed reading.',
        );
      },
      error => {
        setTelemetryError(`GPS speed unavailable: ${error.message}`);
        latestSpeedRef.current = null;
        setSpeedKph(null);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 0,
        interval: 1000,
        fastestInterval: 1000,
        maximumAge: 0,
        timeout: 20_000,
      },
    );
    return true;
  }, []);

  useEffect(() => {
    setMicrophoneGranted(hasMicrophonePermission);
  }, [hasMicrophonePermission]);

  useEffect(() => {
    getConcurrentCameraPairs()
      .then(setConcurrentCameraPairs)
      .catch(error => {
        setCapabilityError(
          error instanceof Error
            ? error.message
            : 'Camera capability detection failed.',
        );
      });
  }, []);

  const clearTimers = useCallback(() => {
    if (segmentTimerRef.current) {
      clearTimeout(segmentTimerRef.current);
      segmentTimerRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const displayTimestampMs =
    status === 'recording' && sessionStartedAtRef.current !== null
      ? sessionStartedAtRef.current + elapsedSeconds * 1000
      : clockTimestampMs;
  const displayDate = new Date(displayTimestampMs);
  const telemetryDisplay =
    `${displayDate.toLocaleTimeString([], {hour12: false})} | ` +
    `${displayDate.toLocaleDateString()} | ${formatSpeed(
      speedKph,
      speedUnit,
    )} ${speedUnit === 'mph' ? 'MPH' : 'KM/H'}`;

  const finishSegments = useCallback(
    async (segments: FinalizedCameraSegment[]) => {
      if (segmentTimerRef.current) {
        clearTimeout(segmentTimerRef.current);
        segmentTimerRef.current = null;
      }
      setStatus('finalizing');
      try {
        await RNFS.mkdir(RECORDINGS_DIRECTORY);
        const endedAt = new Date();
        const recordings: Recording[] = [];
        for (const segment of segments) {
          const {video} = segment;
          const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const filePath = video.path.startsWith('file://')
            ? video.path.slice('file://'.length)
            : video.path;
          const fileExtension = Platform.OS === 'ios' ? 'mov' : 'mp4';
          const destinationPath = `${RECORDINGS_DIRECTORY}/${id}.${fileExtension}`;
          const overlayPath = `${RECORDINGS_DIRECTORY}/${id}.overlay.${fileExtension}`;
          await applyVideoOverlay(
            filePath,
            overlayPath,
            segment.startedAtMs,
            segment.telemetrySamples,
            segment.speedUnit,
          );
          await RNFS.moveFile(overlayPath, destinationPath);
          await RNFS.unlink(filePath);
          const fileInfo = await RNFS.stat(destinationPath);
          if (Number(fileInfo.size) <= 0) {
            throw new Error(
              `The finalized ${segment.cameraPosition} video is empty.`,
            );
          }
          const startedAt = new Date(segment.startedAtMs);
          const endedAtForVideo = new Date(
            segment.startedAtMs + video.duration * 1000,
          );
          recordings.push({
            id,
            displayName: `${
              segment.cameraPosition === 'front' ? 'Front' : 'Rear'
            } Dashcam ${endedAt.toLocaleString()}`,
            startTime: startedAt.toISOString(),
            endTime: endedAtForVideo.toISOString(),
            cameraId: segment.cameraId,
            cameraPosition: segment.cameraPosition,
            width: video.width,
            height: video.height,
            frameRate: segment.frameRate,
            durationSeconds: video.duration,
            fileSizeBytes: Number(fileInfo.size),
            localUri: `file://${destinationPath}`,
            protected: false,
            gpsLatitude: currentTripPoint?.latitude ?? null,
            gpsLongitude: currentTripPoint?.longitude ?? null,
            uploadStatus: 'not-uploaded',
          });
        }
        for (const recording of recordings) {
          await saveRecording(recording);
        }
        await queryClient.invalidateQueries({queryKey: ['recordings']});
        await queryClient.invalidateQueries({queryKey: ['storage']});
        setCameraError(null);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'The video could not be saved to the library.';
        setCameraError(
          `The segment was finalized but could not be indexed: ${message}`,
        );
        activeRef.current = false;
        clearTimers();
        stopLocationUpdates();
        setError(message);
        if (Platform.OS === 'android') {
          stopRecordingForegroundService().catch(stopError => {
            console.error(
              'Could not stop the recording foreground service.',
              stopError,
            );
          });
        }
        return;
      }

      if (activeRef.current) {
        startSegmentRef.current().catch(error => {
          activeRef.current = false;
          clearTimers();
          const message =
            error instanceof Error
              ? error.message
              : 'Could not start the next segment.';
          setCameraError(message);
          setError(message);
          if (Platform.OS === 'android') {
            stopRecordingForegroundService().catch(stopError => {
              console.error(
                'Could not stop the recording foreground service.',
                stopError,
              );
            });
          }
        });
      } else {
        clearTimers();
        stopLocationUpdates();
        if (Platform.OS === 'android') {
          try {
            await stopRecordingForegroundService();
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : 'Could not stop the recording service.';
            setCameraError(message);
            setError(message);
            return;
          }
        }
        setStatus('idle');
      }
    },
    [
      clearTimers,
      currentTripPoint,
      queryClient,
      setError,
      setStatus,
      stopLocationUpdates,
    ],
  );

  const flushFinalizedSegments = useCallback(() => {
    if (
      expectedSegmentsRef.current === 0 ||
      finalizedSegmentsRef.current.length < expectedSegmentsRef.current
    ) {
      return;
    }
    const completedSegments = finalizedSegmentsRef.current.splice(0);
    expectedSegmentsRef.current = 0;
    finishSegments(completedSegments).catch(error => {
      activeRef.current = false;
      clearTimers();
      stopLocationUpdates();
      const message =
        error instanceof Error
          ? error.message
          : 'The segment could not be finalized.';
      setCameraError(message);
      setError(message);
      if (Platform.OS === 'android') {
        stopRecordingForegroundService().catch(stopError => {
          console.error(
            'Could not stop the recording foreground service.',
            stopError,
          );
        });
      }
    });
  }, [clearTimers, finishSegments, setError, stopLocationUpdates]);

  const collectFinalizedSegment = useCallback(
    (segment: FinalizedCameraSegment) => {
      if (expectedSegmentsRef.current === 0) {
        return;
      }
      finalizedSegmentsRef.current.push(segment);
      flushFinalizedSegments();
    },
    [flushFinalizedSegments],
  );

  const startSegment = useCallback(async () => {
    if (!activeRef.current) {
      return;
    }
    const cameras = dualRecordingRef.current
      ? [
          {
            ref: rearCameraRef,
            device: rearDevice,
            position: 'back' as const,
            format: rearFormat,
            fps: rearFps,
          },
          {
            ref: frontCameraRef,
            device: frontDevice,
            position: 'front' as const,
            format: frontFormat,
            fps: frontFps,
          },
        ]
      : [
          {
            ref: cameraRef,
            device,
            position: cameraPosition,
            format,
            fps: selectedFps,
          },
        ];
    if (
      cameras.some(
        camera => !camera.ref.current || !camera.device || !camera.format,
      )
    ) {
      activeRef.current = false;
      clearTimers();
      const message = dualRecordingRef.current
        ? 'Both camera previews must be ready before dual-camera recording can start.'
        : 'Camera preview is not ready. Wait for the preview and try again.';
      setCameraError(message);
      setError(message);
      return;
    }
    try {
      let {freeSpace} = await RNFS.getFSInfo();
      if (freeSpace < LOW_SPACE_LIMIT_BYTES && loopCleanupEnabled) {
        await cleanupOldestRecordingsUntil(1024 * 1024 * 1024);
        await queryClient.invalidateQueries({queryKey: ['recordings']});
        await queryClient.invalidateQueries({queryKey: ['storage']});
        freeSpace = (await RNFS.getFSInfo()).freeSpace;
      }
      if (freeSpace < LOW_SPACE_LIMIT_BYTES) {
        activeRef.current = false;
        clearTimers();
        const message =
          'Recording stopped because less than 512 MB of storage remains.';
        setCameraError(message);
        setError(message);
        return;
      }
      if (!activeRef.current) {
        return;
      }
      setStatus('recording');
      expectedSegmentsRef.current = cameras.length;
      finalizedSegmentsRef.current = [];
      const segmentStartedAtMs = Date.now();
      telemetrySamplesRef.current = [];
      telemetrySamplesRef.current.push({
        timestampMs: segmentStartedAtMs,
        headingDegrees: latestHeadingRef.current,
        speedKph: latestSpeedRef.current,
      });
      cameras.forEach(camera => {
        camera.ref.current?.startRecording({
          fileType: Platform.OS === 'ios' ? 'mov' : 'mp4',
          onRecordingFinished: video => {
            collectFinalizedSegment({
              video,
              cameraId: camera.device?.id ?? 'unknown',
              cameraPosition: camera.position,
              frameRate: camera.fps,
              startedAtMs: segmentStartedAtMs,
              speedUnit,
              telemetrySamples: telemetrySamplesRef.current.filter(
                sample => sample.timestampMs >= segmentStartedAtMs,
              ),
            });
          },
          onRecordingError: error => {
            activeRef.current = false;
            clearTimers();
            setCameraError(error.message);
            setError(`Camera recording failed: ${error.message}`);
            const activePeers = cameras.filter(
              peer => peer.ref !== camera.ref && peer.ref.current,
            );
            expectedSegmentsRef.current =
              finalizedSegmentsRef.current.length + activePeers.length;
            if (activePeers.length === 0) {
              expectedSegmentsRef.current = 0;
              stopLocationUpdates();
              if (Platform.OS === 'android') {
                stopRecordingForegroundService().catch(stopError => {
                  console.error(
                    'Could not stop the recording foreground service.',
                    stopError,
                  );
                });
              }
            }
            activePeers.forEach(peer => {
              peer.ref.current?.stopRecording().catch(stopError => {
                console.error(
                  'Failed to stop the other camera after a recording error.',
                  stopError,
                );
                if (Platform.OS === 'android') {
                  stopRecordingForegroundService().catch(serviceError => {
                    console.error(
                      'Could not stop the recording foreground service.',
                      serviceError,
                    );
                  });
                }
              });
            });
            flushFinalizedSegments();
          },
        });
      });
      segmentTimerRef.current = setTimeout(() => {
        Promise.all(
          cameras.map(camera =>
            camera.ref.current?.stopRecording().catch(error => {
              activeRef.current = false;
              clearTimers();
              const message =
                error instanceof Error
                  ? error.message
                  : 'Could not finalize the segment.';
              setCameraError(message);
              setError(message);
              if (Platform.OS === 'android') {
                stopRecordingForegroundService().catch(stopError => {
                  console.error(
                    'Could not stop the recording foreground service.',
                    stopError,
                  );
                });
              }
            }),
          ),
        ).catch(error => {
          activeRef.current = false;
          clearTimers();
          const message =
            error instanceof Error
              ? error.message
              : 'Could not finalize the segment.';
          setCameraError(message);
          setError(message);
          if (Platform.OS === 'android') {
            stopRecordingForegroundService().catch(stopError => {
              console.error(
                'Could not stop the recording foreground service.',
                stopError,
              );
            });
          }
        });
      }, segmentSeconds * 1000);
    } catch (error) {
      activeRef.current = false;
      expectedSegmentsRef.current = 0;
      finalizedSegmentsRef.current = [];
      clearTimers();
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to check free storage.';
      setCameraError(message);
      setError(message);
      if (Platform.OS === 'android') {
        stopRecordingForegroundService().catch(stopError => {
          console.error(
            'Could not stop the recording foreground service.',
            stopError,
          );
        });
      }
    }
  }, [
    cameraPosition,
    clearTimers,
    collectFinalizedSegment,
    device,
    format,
    flushFinalizedSegments,
    frontDevice,
    frontFormat,
    frontFps,
    loopCleanupEnabled,
    queryClient,
    rearDevice,
    rearFormat,
    rearFps,
    selectedFps,
    segmentSeconds,
    setError,
    setStatus,
    speedUnit,
    stopLocationUpdates,
  ]);

  useEffect(() => {
    startSegmentRef.current = startSegment;
  }, [startSegment]);

  const stopRecording = useCallback(async () => {
    if (!activeRef.current) {
      return;
    }
    activeRef.current = false;
    clearTimers();
    setStatus('finalizing');
    try {
      const activeCameras = dualRecordingRef.current
        ? [rearCameraRef, frontCameraRef]
        : [cameraRef];
      await Promise.all(
        activeCameras.map(camera => camera.current?.stopRecording()),
      );
      stopLocationUpdates();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'The recording could not be stopped safely.';
      stopLocationUpdates();
      setCameraError(message);
      setError(message);
      if (Platform.OS === 'android') {
        stopRecordingForegroundService().catch(stopError => {
          console.error(
            'Could not stop the recording foreground service.',
            stopError,
          );
        });
      }
    }
  }, [clearTimers, setError, setStatus, stopLocationUpdates]);

  const startRecording = useCallback(async () => {
    if (startInProgressRef.current || activeRef.current) {
      return;
    }
    startInProgressRef.current = true;
    setCameraError(null);
    try {
      if (
        dualCaptureEnabled &&
        (!dualCaptureSupported ||
          !frontDevice ||
          !rearDevice ||
          !frontFormat ||
          !rearFormat)
      ) {
        setCameraError(
          'Simultaneous front/rear recording is not supported or ready on this device. Choose single-camera mode.',
        );
        return;
      }
      const permitted =
        hasCameraPermission || (await requestCameraPermission());
      if (!permitted) {
        setCameraError(
          'Camera permission is required to record. Change it in system settings if denied.',
        );
        return;
      }
      if (!device) {
        setCameraError(
          `No ${cameraPosition} camera is available on this device.`,
        );
        return;
      }
      if (!format) {
        setCameraError('This camera does not report a supported video format.');
        return;
      }
      let canRecordAudio = hasMicrophonePermission || microphoneGranted;
      if (audioEnabled && !canRecordAudio) {
        canRecordAudio = await requestMicrophonePermission();
        setMicrophoneGranted(canRecordAudio);
        if (!canRecordAudio) {
          setCameraError(
            'Microphone access was not granted. Disable audio to record without sound.',
          );
          return;
        }
      }

      let locationTelemetryEnabled = false;
      try {
        locationTelemetryEnabled = await startLocationUpdates();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not start GPS telemetry.';
        setTelemetryError(`GPS speed unavailable: ${message}`);
        latestSpeedRef.current = null;
        setSpeedKph(null);
      }

      if (Platform.OS === 'android') {
        if (Number(Platform.Version) >= 33) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Recording notification',
              message:
                'Allow notifications to show when background camera recording is active.',
              buttonPositive: 'Allow',
              buttonNegative: 'Not now',
            },
          );
        }
        await startRecordingForegroundService(
          audioEnabled,
          locationTelemetryEnabled,
        );
      }

      activeRef.current = true;
      dualRecordingRef.current = dualCaptureEnabled;
      sessionStartedAtRef.current = Date.now();
      telemetrySamplesRef.current = [
        {
          timestampMs: sessionStartedAtRef.current,
          headingDegrees: latestHeadingRef.current,
          speedKph: latestSpeedRef.current,
        },
      ];
      setElapsedSeconds(0);
      elapsedTimerRef.current = setInterval(() => {
        const startedAt = sessionStartedAtRef.current;
        if (startedAt !== null) {
          setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
        }
        telemetrySamplesRef.current.push({
          timestampMs: Date.now(),
          headingDegrees: latestHeadingRef.current,
          speedKph: latestSpeedRef.current,
        });
      }, 1000);
      await startSegment();
      if (!activeRef.current && Platform.OS === 'android') {
        await stopRecordingForegroundService();
      }
      if (!activeRef.current) {
        stopLocationUpdates();
      }
    } catch (error) {
      activeRef.current = false;
      clearTimers();
      stopLocationUpdates();
      if (Platform.OS === 'android') {
        stopRecordingForegroundService().catch(stopError => {
          console.error(
            'Could not stop the recording foreground service.',
            stopError,
          );
        });
      }
      throw error;
    } finally {
      startInProgressRef.current = false;
    }
  }, [
    audioEnabled,
    cameraPosition,
    dualCaptureEnabled,
    dualCaptureSupported,
    device,
    format,
    frontDevice,
    frontFormat,
    hasCameraPermission,
    hasMicrophonePermission,
    microphoneGranted,
    requestCameraPermission,
    requestMicrophonePermission,
    rearDevice,
    rearFormat,
    clearTimers,
    setElapsedSeconds,
    startSegment,
    startLocationUpdates,
    stopLocationUpdates,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      setAppState(nextState);
      if (
        Platform.OS === 'ios' &&
        nextState !== 'active' &&
        activeRef.current
      ) {
        stopRecording().catch(error => {
          const message =
            error instanceof Error
              ? error.message
              : 'Could not finalize the recording before iOS suspended the app.';
          setCameraError(message);
          setError(message);
        });
        setCameraError(
          'iOS does not allow camera recording to continue while the app is locked or in the background.',
        );
      }
    });
    return () => subscription.remove();
  }, [setError, stopRecording]);

  useEffect(
    () => () => {
      const wasRecording = activeRef.current;
      activeRef.current = false;
      clearTimers();
      stopLocationUpdates();
      if (wasRecording) {
        const activeCameras = dualRecordingRef.current
          ? [rearCameraRef, frontCameraRef]
          : [cameraRef];
        activeCameras.forEach(camera => {
          camera.current?.stopRecording().catch(error => {
            console.error(
              'Failed to finalize recording during screen teardown.',
              error,
            );
          });
        });
      }
      if (Platform.OS === 'android') {
        stopRecordingForegroundService().catch(error => {
          console.error(
            'Could not stop the recording foreground service.',
            error,
          );
        });
      }
    },
    [clearTimers, stopLocationUpdates],
  );

  const switchCamera = (position: CameraPosition) => {
    if (position === cameraPosition || activeRef.current) {
      return;
    }
    setCameraError(null);
    setCameraPosition(position);
  };

  return (
    <Screen fullscreen>
      <View style={styles.fullscreenCamera}>
        <View style={styles.preview}>
          {hasCameraPermission &&
          dualCaptureEnabled &&
          dualCaptureSupported &&
          frontDevice &&
          rearDevice &&
          frontFormat &&
          rearFormat &&
          (appState === 'active' || activeRef.current) ? (
            <View style={styles.dualPreview}>
              <View style={styles.cameraViewport}>
                <Camera
                  ref={rearCameraRef}
                  style={StyleSheet.absoluteFill}
                  device={rearDevice}
                  format={rearFormat}
                  fps={rearFps}
                  isActive={
                    activeRef.current || (isFocused && appState === 'active')
                  }
                  resizeMode="contain"
                  frameProcessor={vehicleDetector.frameProcessor}
                  video
                  audio={
                    audioEnabled &&
                    cameraPosition === 'back' &&
                    (hasMicrophonePermission || microphoneGranted)
                  }
                  onError={error => {
                    setCameraError(`Rear camera error: ${error.message}`);
                    setError(`Rear camera error: ${error.message}`);
                  }}
                />
                <Text style={styles.cameraLabel}>REAR</Text>
              </View>
              <View style={styles.cameraViewport}>
                <Camera
                  ref={frontCameraRef}
                  style={StyleSheet.absoluteFill}
                  device={frontDevice}
                  format={frontFormat}
                  fps={frontFps}
                  isActive={
                    activeRef.current || (isFocused && appState === 'active')
                  }
                  video
                  audio={
                    audioEnabled &&
                    cameraPosition === 'front' &&
                    (hasMicrophonePermission || microphoneGranted)
                  }
                  onError={error => {
                    setCameraError(`Front camera error: ${error.message}`);
                    setError(`Front camera error: ${error.message}`);
                  }}
                />
                <Text style={styles.cameraLabel}>FRONT</Text>
              </View>
            </View>
          ) : hasCameraPermission &&
            device &&
            format &&
            (appState === 'active' || activeRef.current) ? (
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              format={format}
              fps={selectedFps}
              isActive={
                activeRef.current || (isFocused && appState === 'active')
              }
              resizeMode="contain"
              frameProcessor={
                cameraPosition === 'back'
                  ? vehicleDetector.frameProcessor
                  : undefined
              }
              video
              audio={
                audioEnabled && (hasMicrophonePermission || microphoneGranted)
              }
              onError={error => {
                setCameraError(error.message);
                setError(`Camera error: ${error.message}`);
              }}
            />
          ) : (
            <View style={styles.previewMessage}>
              <Text style={styles.previewGlyph}>◉</Text>
              <Text style={styles.previewText}>
                {!hasCameraPermission
                  ? 'Camera permission is needed for preview'
                  : !device
                  ? `${
                      cameraPosition === 'back' ? 'Rear' : 'Front'
                    } camera unavailable`
                  : 'Camera preview paused'}
              </Text>
              {!hasCameraPermission ? (
                <CameraIconButton
                  label="Allow camera"
                  icon="camera"
                  onPress={() =>
                    requestCameraPermission().catch(error => {
                      const message =
                        error instanceof Error
                          ? error.message
                          : 'Camera permission request failed.';
                      setCameraError(message);
                    })
                  }
                />
              ) : null}
            </View>
          )}
          {roadCameraAvailable ? (
            <View
              pointerEvents="none"
              style={
                dualCaptureEnabled && dualCaptureSupported
                  ? styles.dualDetectionOverlay
                  : StyleSheet.absoluteFill
              }>
              <DetectionOverlay frame={vehicleDetector.frame} />
            </View>
          ) : null}
        </View>
        <View style={styles.cameraOverlay}>
          <View style={styles.overlayTop}>
            <View style={styles.overlayLeading}>
              <CompassIndicator
                headingDegrees={headingDegrees}
                expanded={compassExpanded}
                onToggle={() => setCompassExpanded(expanded => !expanded)}
              />
              <StatusBadge
                label={
                  status === 'recording'
                    ? 'REC'
                    : status === 'finalizing'
                    ? 'SAVING'
                    : 'READY'
                }
                tone={status === 'recording' ? 'danger' : 'neutral'}
              />
            </View>
            <Text style={styles.cameraInfo}>
              {dualCaptureEnabled &&
              dualCaptureSupported &&
              frontDevice &&
              rearDevice
                ? `Rear + front · ${rearFormat?.videoWidth ?? '—'}×${
                    rearFormat?.videoHeight ?? '—'
                  }`
                : device
                ? `${device.name} · ${format?.videoWidth ?? '—'}×${
                    format?.videoHeight ?? '—'
                  } · ${selectedFps} fps`
                : 'Camera capability unavailable'}
            </Text>
          </View>
          <View style={styles.overlayBottom}>
            <Text style={styles.telemetryOverlay}>{telemetryDisplay}</Text>
            {telemetryError ? (
              <Text style={styles.audioStatus}>{telemetryError}</Text>
            ) : null}
            <Text style={styles.aiStatus}>
              {vehicleDetector.status === 'loading'
                ? 'AI: loading YOLOX-Nano COCO model'
                : vehicleDetector.status === 'error'
                ? `AI unavailable: ${
                    vehicleDetector.error ??
                    'The model could not be initialized.'
                  }`
                : vehicleDetector.status === 'disabled'
                ? 'AI paused · select rear camera'
                : `YOLOX-Nano COCO · up to ${vehicleDetector.inferenceFps} FPS`}
            </Text>
            <Text style={styles.audioStatus}>
              {audioEnabled
                ? hasMicrophonePermission || microphoneGranted
                  ? 'Microphone on'
                  : 'Microphone permission needed'
                : 'Microphone off'}
            </Text>
            <Text style={styles.audioStatus}>
              {capabilityError
                ? `Camera capability check failed: ${capabilityError}`
                : dualCaptureSupported
                ? 'Front + rear capture is supported'
                : 'Front + rear capture is unavailable on this device'}
            </Text>
            {cameraError || status === 'error' ? (
              <Text style={styles.cameraError}>
                {cameraError ??
                  recordingError ??
                  'Recording stopped unexpectedly.'}
              </Text>
            ) : null}
            <View style={styles.cameraControls}>
              <CameraIconButton
                label={
                  cameraPosition === 'back'
                    ? 'Switch to front camera'
                    : 'Switch to rear camera'
                }
                icon="switch"
                onPress={() =>
                  switchCamera(cameraPosition === 'back' ? 'front' : 'back')
                }
                disabled={activeRef.current}
              />
              <CameraIconButton
                label={
                  status === 'recording'
                    ? 'Stop recording'
                    : status === 'finalizing'
                    ? 'Saving clip'
                    : 'Start recording'
                }
                icon={status === 'recording' ? 'stop' : 'record'}
                onPress={() => {
                  const action =
                    status === 'recording' ? stopRecording() : startRecording();
                  action.catch(error => {
                    const message =
                      error instanceof Error
                        ? error.message
                        : 'The recording action failed.';
                    setCameraError(message);
                    setError(message);
                  });
                }}
                variant={status === 'recording' ? 'danger' : 'primary'}
                large
                disabled={status === 'finalizing'}
              />
              <CameraIconButton
                label={
                  dualCaptureEnabled
                    ? 'Use single camera'
                    : 'Use front and rear cameras'
                }
                icon={dualCaptureEnabled ? 'single' : 'dual'}
                onPress={() => setDualCaptureEnabled(enabled => !enabled)}
                disabled={!dualCaptureSupported || activeRef.current}
              />
            </View>
            <Text style={styles.timer}>{formatClock(elapsedSeconds)}</Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}

function CameraIconButton({
  label,
  icon,
  onPress,
  disabled = false,
  variant = 'secondary',
  large = false,
}: {
  label: string;
  icon: 'camera' | 'record' | 'stop' | 'switch' | 'dual' | 'single';
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  large?: boolean;
}) {
  const iconColor = colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({pressed}) => [
        styles.cameraControlButton,
        large && styles.largeCameraControlButton,
        variant === 'primary' && styles.primaryCameraControlButton,
        variant === 'danger' && styles.dangerCameraControlButton,
        disabled && styles.disabledCameraControlButton,
        pressed && !disabled && styles.pressedCameraControlButton,
      ]}>
      <Svg width={large ? 30 : 22} height={large ? 30 : 22} viewBox="0 0 24 24">
        {icon === 'record' ? (
          <Circle cx="12" cy="12" r="7" fill={iconColor} />
        ) : icon === 'stop' ? (
          <Rect x="6" y="6" width="12" height="12" rx="2" fill={iconColor} />
        ) : icon === 'switch' ? (
          <>
            <Path
              d="M5 8h14v11H5zM9 8l1.5-2h3L15 8"
              fill="none"
              stroke={iconColor}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <Circle
              cx="12"
              cy="13"
              r="3"
              fill="none"
              stroke={iconColor}
              strokeWidth="1.8"
            />
            <Path
              d="M7 3 4 5l3 2m10 14 3-2-3-2"
              fill="none"
              stroke={iconColor}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </>
        ) : icon === 'dual' ? (
          <>
            <Path
              d="M2.5 8h8v9h-8zM13.5 8h8v9h-8z"
              fill="none"
              stroke={iconColor}
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <Circle
              cx="6.5"
              cy="12.5"
              r="1.8"
              fill="none"
              stroke={iconColor}
              strokeWidth="1.5"
            />
            <Circle
              cx="17.5"
              cy="12.5"
              r="1.8"
              fill="none"
              stroke={iconColor}
              strokeWidth="1.5"
            />
          </>
        ) : icon === 'single' ? (
          <>
            <Path
              d="M3 8h5l2-2h4l2 2h5v10H3z"
              fill="none"
              stroke={iconColor}
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <Circle
              cx="12"
              cy="13"
              r="3"
              fill="none"
              stroke={iconColor}
              strokeWidth="1.8"
            />
          </>
        ) : (
          <>
            <Path
              d="M3 8h5l2-3h5l2 3h4a1 1 0 0 1 1 1v10H2V9a1 1 0 0 1 1-1Z"
              fill="none"
              stroke={iconColor}
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <Circle
              cx="12"
              cy="13"
              r="3"
              fill="none"
              stroke={iconColor}
              strokeWidth="1.8"
            />
          </>
        )}
      </Svg>
    </Pressable>
  );
}

function CompassIndicator({
  headingDegrees,
  expanded,
  onToggle,
}: {
  headingDegrees: number | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={expanded ? 'Hide compass' : 'Show compass'}
      onPress={onToggle}
      style={styles.compassIndicator}>
      {expanded ? (
        <Svg width={46} height={46} viewBox="0 0 24 24">
          <Circle
            cx="12"
            cy="12"
            r="10.5"
            fill="transparent"
            stroke="#FFFFFF99"
            strokeWidth="1.2"
          />
          <SvgText
            x="12"
            y="7.5"
            fill="#FFFFFF"
            fontSize="5"
            fontWeight="700"
            textAnchor="middle">
            N
          </SvgText>
          <Path
            d="M12 8.5 15 16l-3-1.6L9 16z"
            fill="#FF453A"
            transform={
              headingDegrees === null
                ? undefined
                : `rotate(${-headingDegrees} 12 12)`
            }
          />
        </Svg>
      ) : (
        <Text style={styles.compassReading}>
          {getCardinalDirection(headingDegrees)} {formatHeading(headingDegrees)}
        </Text>
      )}
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path
          d={expanded ? 'm7 14 5-5 5 5' : 'm7 10 5 5 5-5'}
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

function formatClock(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
}

const styles = StyleSheet.create({
  fullscreenCamera: {flex: 1, backgroundColor: '#020508'},
  preview: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#020508',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  overlayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  overlayLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compassIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 24,
    backgroundColor: 'transparent',
    padding: spacing.xs,
  },
  compassReading: {
    minWidth: 62,
    color: colors.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
  },
  overlayBottom: {
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  cameraControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  cameraControlButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#FFFFFF66',
    backgroundColor: '#08111DE8',
  },
  largeCameraControlButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
  },
  primaryCameraControlButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dangerCameraControlButton: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  disabledCameraControlButton: {opacity: 0.45},
  pressedCameraControlButton: {opacity: 0.72},
  cameraInfo: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
    textAlign: 'right',
  },
  aiStatus: {color: colors.accent, fontSize: 12, fontWeight: '700'},
  telemetryOverlay: {
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: colors.text,
    backgroundColor: '#08111DE8',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    textAlign: 'center',
  },
  audioStatus: {color: colors.secondaryText, fontSize: 11},
  cameraError: {color: colors.danger, fontSize: 12},
  dualPreview: {flex: 1, flexDirection: 'row', width: '100%'},
  cameraViewport: {
    flex: 1,
    overflow: 'hidden',
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dualDetectionOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '50%',
  },
  cameraLabel: {
    position: 'absolute',
    left: spacing.xs,
    top: spacing.xs,
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#00000099',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  previewMessage: {alignItems: 'center', gap: spacing.md, padding: spacing.md},
  previewGlyph: {color: colors.accent, fontSize: 38},
  previewText: {color: colors.secondaryText, textAlign: 'center'},
  timer: {
    alignSelf: 'center',
    color: colors.text,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    textShadowColor: '#000000',
    textShadowRadius: 4,
  },
});
