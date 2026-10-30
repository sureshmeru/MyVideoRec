import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AppState,
  AppStateStatus,
  PermissionsAndroid,
  Platform,
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
import * as RNFS from 'react-native-fs';
import {useQueryClient} from '@tanstack/react-query';

import {colors, spacing} from '../app/theme';
import {Card, Screen} from '../components/Screen';
import {ActionButton, Label, StatusBadge} from '../components/UI';
import {saveRecording} from '../data/database';
import type {CameraPosition, Recording} from '../data/models';
import {useSettingsStore} from '../features/recording/settingsStore';
import {selectRecordingFormat} from '../features/recording/selectRecordingFormat';
import {useRecordingStore} from '../features/recording/recordingStore';
import {formatBytes} from '../features/storage/formatBytes';
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
}

export function RecordingScreen() {
  const cameraRef = useRef<Camera>(null);
  const frontCameraRef = useRef<Camera>(null);
  const rearCameraRef = useRef<Camera>(null);
  const activeRef = useRef(false);
  const startInProgressRef = useRef(false);
  const dualRecordingRef = useRef(false);
  const expectedSegmentsRef = useRef(0);
  const finalizedSegmentsRef = useRef<FinalizedCameraSegment[]>([]);
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const startSegmentRef = useRef<() => Promise<void>>(async () => {});
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [microphoneGranted, setMicrophoneGranted] = useState(false);
  const [dualCaptureEnabled, setDualCaptureEnabled] = useState(false);
  const [concurrentCameraPairs, setConcurrentCameraPairs] = useState<string[][]>([]);
  const [capabilityError, setCapabilityError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const cameraPosition = useSettingsStore(state => state.cameraPosition);
  const setCameraPosition = useSettingsStore(state => state.setCameraPosition);
  const audioEnabled = useSettingsStore(state => state.audioEnabled);
  const segmentSeconds = useSettingsStore(state => state.segmentSeconds);
  const loopCleanupEnabled = useSettingsStore(state => state.loopCleanupEnabled);
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
  const {hasPermission: hasCameraPermission, requestPermission: requestCameraPermission} =
    useCameraPermission();
  const {
    hasPermission: hasMicrophonePermission,
    requestPermission: requestMicrophonePermission,
  } = useMicrophonePermission();

  const format = useMemo(
    () => selectRecordingFormat(device?.formats ?? []),
    [device?.formats],
  );
  const selectedFps = format
    ? Math.max(format.minFps, Math.min(30, format.maxFps))
    : 30;
  const frontFormat = useMemo(
    () => selectRecordingFormat(frontDevice?.formats ?? []),
    [frontDevice?.formats],
  );
  const rearFormat = useMemo(
    () => selectRecordingFormat(rearDevice?.formats ?? []),
    [rearDevice?.formats],
  );
  const frontFps = frontFormat
    ? Math.max(frontFormat.minFps, Math.min(30, frontFormat.maxFps))
    : 30;
  const rearFps = rearFormat
    ? Math.max(rearFormat.minFps, Math.min(30, rearFormat.maxFps))
    : 30;
  const dualCaptureSupported = supportsConcurrentFrontRear(
    concurrentCameraPairs,
    frontDevice?.id,
    rearDevice?.id,
  );

  useEffect(() => {
    setMicrophoneGranted(hasMicrophonePermission);
  }, [hasMicrophonePermission]);

  useEffect(() => {
    getConcurrentCameraPairs()
      .then(setConcurrentCameraPairs)
      .catch(error => {
        setCapabilityError(
          error instanceof Error ? error.message : 'Camera capability detection failed.',
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
          await RNFS.moveFile(filePath, destinationPath);
          const fileInfo = await RNFS.stat(destinationPath);
          if (Number(fileInfo.size) <= 0) {
            throw new Error(`The finalized ${segment.cameraPosition} video is empty.`);
          }
          const segmentEndedAt = new Date();
          const startedAt = new Date(segmentEndedAt.getTime() - video.duration * 1000);
          recordings.push({
            id,
            displayName: `${segment.cameraPosition === 'front' ? 'Front' : 'Rear'} Dashcam ${endedAt.toLocaleString()}`,
            startTime: startedAt.toISOString(),
            endTime: segmentEndedAt.toISOString(),
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
          error instanceof Error ? error.message : 'The video could not be saved to the library.';
        setCameraError(`The segment was finalized but could not be indexed: ${message}`);
        activeRef.current = false;
        clearTimers();
        setError(message);
        if (Platform.OS === 'android') {
          stopRecordingForegroundService().catch(stopError => {
            console.error('Could not stop the recording foreground service.', stopError);
          });
        }
        return;
      }

      if (activeRef.current) {
        startSegmentRef.current().catch(error => {
          activeRef.current = false;
          clearTimers();
          const message = error instanceof Error ? error.message : 'Could not start the next segment.';
          setCameraError(message);
          setError(message);
          if (Platform.OS === 'android') {
            stopRecordingForegroundService().catch(stopError => {
              console.error('Could not stop the recording foreground service.', stopError);
            });
          }
        });
      } else {
        clearTimers();
        if (Platform.OS === 'android') {
          try {
            await stopRecordingForegroundService();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Could not stop the recording service.';
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
      const message =
        error instanceof Error ? error.message : 'The segment could not be finalized.';
      setCameraError(message);
      setError(message);
      if (Platform.OS === 'android') {
        stopRecordingForegroundService().catch(stopError => {
          console.error('Could not stop the recording foreground service.', stopError);
        });
      }
    });
  }, [clearTimers, finishSegments, setError]);

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
    if (cameras.some(camera => !camera.ref.current || !camera.device || !camera.format)) {
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
        const message = 'Recording stopped because less than 512 MB of storage remains.';
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
      cameras.forEach(camera => {
        camera.ref.current?.startRecording({
          fileType: Platform.OS === 'ios' ? 'mov' : 'mp4',
          onRecordingFinished: video => {
            collectFinalizedSegment({
              video,
              cameraId: camera.device?.id ?? 'unknown',
              cameraPosition: camera.position,
              frameRate: camera.fps,
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
              if (Platform.OS === 'android') {
                stopRecordingForegroundService().catch(stopError => {
                  console.error('Could not stop the recording foreground service.', stopError);
                });
              }
            }
            activePeers.forEach(peer => {
              peer.ref.current?.stopRecording().catch(stopError => {
                console.error('Failed to stop the other camera after a recording error.', stopError);
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
                error instanceof Error ? error.message : 'Could not finalize the segment.';
              setCameraError(message);
              setError(message);
              if (Platform.OS === 'android') {
                stopRecordingForegroundService().catch(stopError => {
                  console.error('Could not stop the recording foreground service.', stopError);
                });
              }
            }),
          ),
        ).catch(error => {
          activeRef.current = false;
          clearTimers();
          const message =
            error instanceof Error ? error.message : 'Could not finalize the segment.';
          setCameraError(message);
          setError(message);
          if (Platform.OS === 'android') {
            stopRecordingForegroundService().catch(stopError => {
              console.error('Could not stop the recording foreground service.', stopError);
            });
          }
        });
      }, segmentSeconds * 1000);
    } catch (error) {
      activeRef.current = false;
      expectedSegmentsRef.current = 0;
      finalizedSegmentsRef.current = [];
      clearTimers();
      const message = error instanceof Error ? error.message : 'Unable to check free storage.';
      setCameraError(message);
      setError(message);
      if (Platform.OS === 'android') {
        stopRecordingForegroundService().catch(stopError => {
          console.error('Could not stop the recording foreground service.', stopError);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The recording could not be stopped safely.';
      setCameraError(message);
      setError(message);
      if (Platform.OS === 'android') {
        stopRecordingForegroundService().catch(stopError => {
          console.error('Could not stop the recording foreground service.', stopError);
        });
      }
    }
  }, [clearTimers, setError, setStatus]);

  const startRecording = useCallback(async () => {
    if (startInProgressRef.current || activeRef.current) {
      return;
    }
    startInProgressRef.current = true;
    setCameraError(null);
    try {
      if (
        dualCaptureEnabled &&
        (!dualCaptureSupported || !frontDevice || !rearDevice || !frontFormat || !rearFormat)
      ) {
        setCameraError(
          'Simultaneous front/rear recording is not supported or ready on this device. Choose single-camera mode.',
        );
        return;
      }
      const permitted = hasCameraPermission || (await requestCameraPermission());
      if (!permitted) {
        setCameraError('Camera permission is required to record. Change it in system settings if denied.');
        return;
      }
      if (!device) {
        setCameraError(`No ${cameraPosition} camera is available on this device.`);
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
          setCameraError('Microphone access was not granted. Disable audio to record without sound.');
          return;
        }
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
        await startRecordingForegroundService(audioEnabled);
      }

      activeRef.current = true;
      dualRecordingRef.current = dualCaptureEnabled;
      sessionStartedAtRef.current = Date.now();
      setElapsedSeconds(0);
      elapsedTimerRef.current = setInterval(() => {
        const startedAt = sessionStartedAtRef.current;
        if (startedAt !== null) {
          setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
        }
      }, 1000);
      await startSegment();
      if (!activeRef.current && Platform.OS === 'android') {
        await stopRecordingForegroundService();
      }
    } catch (error) {
      activeRef.current = false;
      clearTimers();
      if (Platform.OS === 'android') {
        stopRecordingForegroundService().catch(stopError => {
          console.error('Could not stop the recording foreground service.', stopError);
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
      if (wasRecording) {
        const activeCameras = dualRecordingRef.current
          ? [rearCameraRef, frontCameraRef]
          : [cameraRef];
        activeCameras.forEach(camera => {
          camera.current?.stopRecording().catch(error => {
            console.error('Failed to finalize recording during screen teardown.', error);
          });
        });
      }
      if (Platform.OS === 'android') {
        stopRecordingForegroundService().catch(error => {
          console.error('Could not stop the recording foreground service.', error);
        });
      }
    },
    [clearTimers],
  );

  const switchCamera = (position: CameraPosition) => {
    if (position === cameraPosition || activeRef.current) {
      return;
    }
    setCameraError(null);
    setCameraPosition(position);
  };

  return (
    <Screen
      title="Record"
      subtitle={
        Platform.OS === 'android'
          ? 'An active recording uses an Android camera/microphone foreground service while locked; device policies can still interrupt capture.'
          : 'Keep the app in the foreground while recording; iOS does not support locked-screen camera capture.'
      }>
      <Card style={styles.previewCard}>
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
                  isActive={activeRef.current || (isFocused && appState === 'active')}
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
                  isActive={activeRef.current || (isFocused && appState === 'active')}
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
          ) :
          hasCameraPermission &&
          device &&
          format &&
          (appState === 'active' || activeRef.current) ? (
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              format={format}
              fps={selectedFps}
              isActive={activeRef.current || (isFocused && appState === 'active')}
              video
              audio={audioEnabled && (hasMicrophonePermission || microphoneGranted)}
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
                    ? `${cameraPosition === 'back' ? 'Rear' : 'Front'} camera unavailable`
                    : 'Camera preview paused'}
              </Text>
              {!hasCameraPermission ? (
                <ActionButton
                  label="Allow camera"
                  onPress={() =>
                    requestCameraPermission().catch(error => {
                      const message = error instanceof Error ? error.message : 'Camera permission request failed.';
                      setCameraError(message);
                    })
                  }
                />
              ) : null}
            </View>
          )}
          <View style={styles.previewBadge}>
            <StatusBadge
              label={status === 'recording' ? 'REC' : status === 'finalizing' ? 'SAVING' : 'READY'}
              tone={status === 'recording' ? 'danger' : 'neutral'}
            />
          </View>
        </View>
        <View style={styles.details}>
          <Label>
            {dualCaptureEnabled && dualCaptureSupported && frontDevice && rearDevice
              ? `Rear + front · ${rearFormat?.videoWidth ?? '—'}×${rearFormat?.videoHeight ?? '—'} / ${frontFormat?.videoWidth ?? '—'}×${frontFormat?.videoHeight ?? '—'}`
              : device
                ? `${device.name} · ${format?.videoWidth ?? '—'} × ${format?.videoHeight ?? '—'} · up to ${selectedFps} fps`
                : 'Camera capability unavailable'}
          </Label>
          <Label>
            {audioEnabled
              ? hasMicrophonePermission
                ? 'Microphone enabled'
                : 'Microphone permission needed'
              : 'Microphone off'}
            {' · '}
            {formatBytes(LOW_SPACE_LIMIT_BYTES)} storage reserve
          </Label>
        </View>
      </Card>

      <Card style={styles.capabilityCard}>
        <Label>
          {Platform.OS !== 'android'
            ? 'Dual-camera recording is unavailable in this iOS capture implementation. Use single-camera mode.'
            : capabilityError
              ? `Dual-camera capability could not be checked: ${capabilityError}`
              : dualCaptureSupported
                ? 'This Android device reports front/rear concurrent camera support. Dual recording creates two separate clips and may increase heat and battery use.'
                : 'This Android device does not report front/rear concurrent camera support. Single-camera recording remains available.'}
        </Label>
        <ActionButton
          label={dualCaptureEnabled ? 'Use single camera' : 'Use front + rear cameras'}
          onPress={() => setDualCaptureEnabled(enabled => !enabled)}
          variant="secondary"
          disabled={!dualCaptureSupported || activeRef.current}
        />
      </Card>

      {cameraError ? (
        <Card>
          <Label color={colors.danger}>{cameraError}</Label>
        </Card>
      ) : null}
      {status === 'error' ? (
        <Card>
          <Label color={colors.danger}>
            {recordingError ?? 'Recording stopped unexpectedly.'}
          </Label>
        </Card>
      ) : null}
      <View style={styles.controls}>
        <ActionButton
          label={status === 'recording' ? 'Stop recording' : status === 'finalizing' ? 'Saving clip…' : 'Start recording'}
          onPress={() => {
            const action = status === 'recording' ? stopRecording() : startRecording();
            action.catch(error => {
              const message = error instanceof Error ? error.message : 'The recording action failed.';
              setCameraError(message);
              setError(message);
            });
          }}
          variant={status === 'recording' ? 'danger' : 'primary'}
          disabled={status === 'finalizing'}
        />
        <View style={styles.secondaryControls}>
          <ActionButton
            label={cameraPosition === 'back' ? 'Switch to front' : 'Switch to rear'}
            onPress={() => switchCamera(cameraPosition === 'back' ? 'front' : 'back')}
            variant="secondary"
            disabled={activeRef.current}
          />
          <Text style={styles.timer}>{formatClock(elapsedSeconds)}</Text>
        </View>
      </View>
    </Screen>
  );
}

function formatClock(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder].map(value => String(value).padStart(2, '0')).join(':');
}

const styles = StyleSheet.create({
  previewCard: {padding: 8},
  preview: {
    height: 290,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#020508',
  },
  dualPreview: {flex: 1, flexDirection: 'row', width: '100%'},
  cameraViewport: {
    flex: 1,
    overflow: 'hidden',
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
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
  capabilityCard: {gap: spacing.sm},
  previewMessage: {alignItems: 'center', gap: spacing.md, padding: spacing.md},
  previewGlyph: {color: colors.accent, fontSize: 38},
  previewText: {color: colors.secondaryText, textAlign: 'center'},
  previewBadge: {position: 'absolute', top: spacing.sm, left: spacing.sm},
  details: {gap: 5, padding: spacing.sm},
  controls: {gap: spacing.sm},
  secondaryControls: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  timer: {flex: 1, color: colors.text, fontSize: 25, fontVariant: ['tabular-nums'], textAlign: 'right'},
});
