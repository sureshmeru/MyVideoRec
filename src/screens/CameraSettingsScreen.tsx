import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import * as RNFS from 'react-native-fs';
import {useCameraDevice} from 'react-native-vision-camera';
import {useIsFocused} from '@react-navigation/native';

import {colors, spacing} from '../app/theme';
import {Card, Screen} from '../components/Screen';
import {ActionButton, Label, Row} from '../components/UI';
import {useRecordingStore} from '../features/recording/recordingStore';
import {getSupportedVideoCodecs} from '../features/recording/cameraCapabilities';
import {
  hydrateSettingsStore,
  useSettingsStore,
} from '../features/recording/settingsStore';
import {
  getActualResolutionLabel,
  getEstimatedBytesPerMinute,
  getEstimatedBytesForDuration,
  getRecordingConfiguration,
  getSupportedFrameRates,
  getSupportedResolutions,
  getVideoBitrateMbps,
  selectRecordingFormat,
  VIDEO_RESOLUTIONS,
} from '../features/recording/videoSettings';
import type {
  VideoCodec,
  VideoQuality,
  VideoResolution,
} from '../features/recording/videoSettings';
import {formatBytes} from '../features/storage/formatBytes';

const SEGMENT_LENGTHS = [60, 300, 600];
const LOW_SPACE_LIMIT_BYTES = 512 * 1024 * 1024;
const QUALITY_OPTIONS: Array<{
  id: VideoQuality;
  title: string;
  detail: string;
}> = [
  {id: 'low', title: 'Low', detail: 'Smaller files'},
  {id: 'medium', title: 'Medium', detail: 'Balanced'},
  {id: 'high', title: 'High', detail: 'Maximum quality'},
];
const CODEC_OPTIONS: Array<{id: VideoCodec; label: string}> = [
  {id: 'h264', label: 'H.264'},
  {id: 'h265', label: 'H.265'},
];

export function CameraSettingsScreen() {
  const isFocused = useIsFocused();
  const cameraPosition = useSettingsStore(state => state.cameraPosition);
  const setCameraPosition = useSettingsStore(state => state.setCameraPosition);
  const audioEnabled = useSettingsStore(state => state.audioEnabled);
  const setAudioEnabled = useSettingsStore(state => state.setAudioEnabled);
  const segmentSeconds = useSettingsStore(state => state.segmentSeconds);
  const setSegmentSeconds = useSettingsStore(state => state.setSegmentSeconds);
  const videoResolution = useSettingsStore(state => state.videoResolution);
  const videoQuality = useSettingsStore(state => state.videoQuality);
  const frameRate = useSettingsStore(state => state.frameRate);
  const videoCodec = useSettingsStore(state => state.videoCodec);
  const customBitrateMbps = useSettingsStore(state => state.customBitrateMbps);
  const setVideoResolution = useSettingsStore(
    state => state.setVideoResolution,
  );
  const setVideoQuality = useSettingsStore(state => state.setVideoQuality);
  const setFrameRate = useSettingsStore(state => state.setFrameRate);
  const setVideoCodec = useSettingsStore(state => state.setVideoCodec);
  const setCustomBitrateMbps = useSettingsStore(
    state => state.setCustomBitrateMbps,
  );
  const recordingStatus = useRecordingStore(state => state.status);
  const device = useCameraDevice(cameraPosition);
  const [settingsReady, setSettingsReady] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [codecError, setCodecError] = useState<string | null>(null);
  const [codecs, setCodecs] = useState<VideoCodec[]>([]);
  const [codecLoading, setCodecLoading] = useState(false);
  const [freeSpace, setFreeSpace] = useState<number | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [customBitrateText, setCustomBitrateText] = useState(
    customBitrateMbps === null ? '' : String(customBitrateMbps),
  );
  const [bitrateInputError, setBitrateInputError] = useState<string | null>(
    null,
  );
  const isRecording =
    recordingStatus === 'recording' || recordingStatus === 'finalizing';

  const supportedResolutions = useMemo(
    () => getSupportedResolutions(device?.formats ?? []),
    [device?.formats],
  );
  const supportedFrameRates = useMemo(
    () => getSupportedFrameRates(device?.formats ?? [], videoResolution),
    [device?.formats, videoResolution],
  );
  const selectedFormat = useMemo(
    () =>
      selectRecordingFormat(device?.formats ?? [], videoResolution, frameRate),
    [device?.formats, videoResolution, frameRate],
  );
  const bitrateMbps = getVideoBitrateMbps(
    videoResolution,
    videoQuality,
    customBitrateMbps,
  );
  const estimatedBytesPerMinute = getEstimatedBytesPerMinute(bitrateMbps);
  const estimatedSegmentBytes = getEstimatedBytesForDuration(
    bitrateMbps,
    segmentSeconds,
  );
  const requiredFreeBytes = LOW_SPACE_LIMIT_BYTES + estimatedSegmentBytes;

  useEffect(() => {
    let active = true;
    hydrateSettingsStore()
      .then(() => {
        if (active) {
          setSettingsReady(true);
          setSettingsError(null);
          setCustomBitrateText(
            useSettingsStore.getState().customBitrateMbps === null
              ? ''
              : String(useSettingsStore.getState().customBitrateMbps),
          );
        }
      })
      .catch(error => {
        if (active) {
          setSettingsError(
            error instanceof Error
              ? error.message
              : 'Camera settings could not be restored.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!settingsReady || !device || isRecording) {
      return;
    }
    const configuration = getRecordingConfiguration(
      device.formats,
      videoResolution,
      frameRate,
    );
    if (!configuration) {
      return;
    }
    if (configuration.resolution !== videoResolution) {
      setVideoResolution(configuration.resolution);
      return;
    }
    if (configuration.frameRate !== frameRate) {
      setFrameRate(configuration.frameRate);
    }
  }, [
    device,
    frameRate,
    isRecording,
    setFrameRate,
    setVideoResolution,
    settingsReady,
    videoResolution,
  ]);

  useEffect(() => {
    let active = true;
    if (!isFocused) {
      return () => {
        active = false;
      };
    }
    RNFS.getFSInfo()
      .then(info => {
        if (active) {
          setFreeSpace(info.freeSpace);
          setStorageError(null);
        }
      })
      .catch(error => {
        if (active) {
          setFreeSpace(null);
          setStorageError(
            error instanceof Error
              ? error.message
              : 'Available storage could not be checked.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [isFocused]);

  useEffect(() => {
    let active = true;
    if (!settingsReady || !selectedFormat) {
      setCodecs([]);
      setCodecLoading(false);
      return () => {
        active = false;
      };
    }
    setCodecLoading(true);
    setCodecError(null);
    getSupportedVideoCodecs(
      selectedFormat.videoWidth,
      selectedFormat.videoHeight,
      frameRate,
    )
      .then(supported => {
        if (!active) {
          return;
        }
        setCodecs(supported);
        if (supported.length === 0) {
          setCodecError(
            'No compatible video encoder was reported for this camera setting.',
          );
        } else if (!supported.includes(videoCodec)) {
          setVideoCodec(supported.includes('h264') ? 'h264' : supported[0]);
        }
      })
      .catch(error => {
        if (active) {
          setCodecs(['h264']);
          setCodecError(
            error instanceof Error
              ? error.message
              : 'Video codec support could not be checked.',
          );
          if (videoCodec === 'h265') {
            setVideoCodec('h264');
          }
        }
      })
      .finally(() => {
        if (active) {
          setCodecLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [
    device?.id,
    frameRate,
    selectedFormat,
    setVideoCodec,
    settingsReady,
    videoCodec,
  ]);

  const handleCustomBitrateChange = (value: string) => {
    setCustomBitrateText(value);
    if (value.trim() === '') {
      setCustomBitrateMbps(null);
      setBitrateInputError(null);
      return;
    }
    const bitrate = Number(value);
    if (!Number.isFinite(bitrate) || bitrate < 0.5 || bitrate > 100) {
      setBitrateInputError('Enter a bitrate from 0.5 to 100 Mbps.');
      return;
    }
    setBitrateInputError(null);
    setCustomBitrateMbps(bitrate);
  };

  const configurationDisabled = isRecording || !settingsReady || !device;

  return (
    <Screen title="Camera & recording">
      {settingsError ? (
        <Card>
          <Label color={colors.danger}>{settingsError}</Label>
        </Card>
      ) : null}
      <Card>
        <Row
          title="Selected camera"
          value={cameraPosition === 'back' ? 'Rear camera' : 'Front camera'}
        />
        <View style={styles.buttonRow}>
          <ActionButton
            label="Use rear"
            variant={cameraPosition === 'back' ? 'primary' : 'secondary'}
            onPress={() => setCameraPosition('back')}
            disabled={isRecording || !settingsReady}
          />
          <ActionButton
            label="Use front"
            variant={cameraPosition === 'front' ? 'primary' : 'secondary'}
            onPress={() => setCameraPosition('front')}
            disabled={isRecording || !settingsReady}
          />
        </View>
        <Label>
          The selected camera is checked on the recording screen. No dual-camera
          capture is claimed.
        </Label>
      </Card>

      <Card>
        <Text style={styles.heading}>CAMERA SETTINGS</Text>
        <Text style={styles.sectionTitle}>Video resolution</Text>
        {supportedResolutions.length > 0 ? (
          <ChoiceGroup
            options={VIDEO_RESOLUTIONS.filter(option =>
              supportedResolutions.includes(option.id),
            ).map(option => ({id: option.id, label: option.label}))}
            selected={
              supportedResolutions.includes(videoResolution)
                ? videoResolution
                : undefined
            }
            onSelect={value => setVideoResolution(value as VideoResolution)}
            disabled={configurationDisabled}
          />
        ) : (
          <Label>
            {device
              ? 'This camera does not report a supported recording resolution.'
              : 'Waiting for camera capability detection.'}
          </Label>
        )}
        <Text style={styles.sectionTitle}>Video quality</Text>
        <ChoiceGroup
          options={QUALITY_OPTIONS.map(option => ({
            id: option.id,
            label: option.title,
          }))}
          selected={videoQuality}
          onSelect={value => setVideoQuality(value as VideoQuality)}
          disabled={configurationDisabled}
        />
        <Label>
          {QUALITY_OPTIONS.find(option => option.id === videoQuality)?.detail}
          {customBitrateMbps === null
            ? ` · ${bitrateMbps} Mbps estimated`
            : ` · Custom ${bitrateMbps} Mbps`}
        </Label>

        <Text style={styles.sectionTitle}>Frame rate</Text>
        {supportedFrameRates.length > 0 ? (
          <ChoiceGroup
            options={supportedFrameRates.map(value => ({
              id: value,
              label: `${value} FPS`,
            }))}
            selected={
              supportedFrameRates.includes(frameRate) ? frameRate : undefined
            }
            onSelect={value => setFrameRate(value as number)}
            disabled={configurationDisabled}
          />
        ) : (
          <Label>No supported frame rates for this resolution.</Label>
        )}

        <Text style={styles.sectionTitle}>Video format</Text>
        {codecLoading ? (
          <Label>Checking encoder support…</Label>
        ) : codecs.length > 0 ? (
          <ChoiceGroup
            options={CODEC_OPTIONS.filter(option =>
              codecs.includes(option.id),
            ).map(option => ({id: option.id, label: option.label}))}
            selected={codecs.includes(videoCodec) ? videoCodec : undefined}
            onSelect={value => setVideoCodec(value as VideoCodec)}
            disabled={configurationDisabled}
          />
        ) : (
          <Label>
            No compatible codec was reported for this configuration.
          </Label>
        )}
        {codecError ? <Label color={colors.warning}>{codecError}</Label> : null}
        <Label>
          Recordings are saved as MP4. Codec support is checked for the selected
          camera resolution and frame rate.
        </Label>

        <Text style={styles.sectionTitle}>Advanced bitrate (Mbps)</Text>
        <TextInput
          accessibilityLabel="Custom video bitrate in Mbps"
          keyboardType="decimal-pad"
          value={customBitrateText}
          onChangeText={handleCustomBitrateChange}
          editable={!configurationDisabled}
          placeholder="Use quality preset"
          placeholderTextColor={colors.muted}
          style={[
            styles.bitrateInput,
            configurationDisabled && styles.disabled,
          ]}
        />
        <Label>
          VisionCamera applies this bitrate to the recording. Leave blank to use
          the selected quality preset.
        </Label>
        {bitrateInputError ? (
          <Label color={colors.danger}>{bitrateInputError}</Label>
        ) : null}
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Storage estimate</Text>
        <Row
          title="Estimated file size"
          value={
            selectedFormat
              ? `${formatBytes(estimatedBytesPerMinute)} per minute`
              : 'Unavailable for current camera'
          }
        />
        <Row
          title={`Estimated ${segmentSeconds / 60}-minute segment`}
          value={
            selectedFormat
              ? formatBytes(estimatedSegmentBytes)
              : 'Unavailable for current camera'
          }
        />
        <Row
          title="Available device storage"
          value={freeSpace === null ? 'Unavailable' : formatBytes(freeSpace)}
        />
        <Row
          title="Current selected resolution"
          value={
            selectedFormat
              ? `${videoResolution} · ${getActualResolutionLabel(
                  selectedFormat,
                )}`
              : 'Camera configuration unavailable'
          }
        />
        <Row
          title="Current recording quality"
          value={
            selectedFormat
              ? `${videoQuality} · ${frameRate} FPS · ${videoCodec.toUpperCase()} · ${bitrateMbps} Mbps`
              : 'Camera configuration unavailable'
          }
        />
        {storageError ? (
          <Label color={colors.warning}>
            Storage check failed: {storageError}
          </Label>
        ) : freeSpace !== null && freeSpace < requiredFreeBytes ? (
          <Label color={colors.warning}>
            Available storage may not fit the selected segment and the
            {` ${formatBytes(LOW_SPACE_LIMIT_BYTES)} `}recording reserve. Aim
            for at least {formatBytes(requiredFreeBytes)} free.
          </Label>
        ) : null}
      </Card>

      {isRecording ? (
        <Card>
          <Label color={colors.warning}>
            Stop the active recording before changing its camera configuration.
            New settings apply to the next recording.
          </Label>
        </Card>
      ) : null}

      <Card>
        <Row
          title="Microphone audio"
          value={audioEnabled ? 'On (permission required)' : 'Off'}
        />
        <ActionButton
          label={audioEnabled ? 'Disable audio' : 'Enable audio'}
          variant="secondary"
          onPress={() => setAudioEnabled(!audioEnabled)}
          disabled={isRecording}
        />
        <Label>
          Microphone permission is requested only when you start a recording
          with audio enabled.
        </Label>
      </Card>
      <Card>
        <Text style={styles.heading}>Video segment length</Text>
        <View style={styles.buttonRow}>
          {SEGMENT_LENGTHS.map(seconds => (
            <ActionButton
              key={seconds}
              label={`${seconds / 60} min`}
              variant={segmentSeconds === seconds ? 'primary' : 'secondary'}
              onPress={() => setSegmentSeconds(seconds)}
              disabled={isRecording}
            />
          ))}
        </View>
        <Label>
          Each segment is finalized locally before it is added to the library.
        </Label>
      </Card>
    </Screen>
  );
}

function ChoiceGroup<T extends string | number>({
  options,
  selected,
  onSelect,
  disabled,
}: {
  options: Array<{id: T; label: string}>;
  selected?: T;
  onSelect: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.choiceRow}>
      {options.map(option => (
        <Pressable
          key={String(option.id)}
          accessibilityRole="button"
          accessibilityState={{selected: selected === option.id, disabled}}
          disabled={disabled}
          onPress={() => onSelect(option.id)}
          style={[
            styles.choice,
            selected === option.id && styles.selectedChoice,
            disabled && styles.disabled,
          ]}>
          <Text
            style={[
              styles.choiceLabel,
              selected === option.id && styles.selectedChoiceLabel,
            ]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  buttonRow: {flexDirection: 'row', gap: spacing.sm},
  heading: {color: colors.text, fontSize: 16, fontWeight: '700'},
  sectionTitle: {color: colors.text, fontSize: 14, fontWeight: '700'},
  choiceRow: {flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs},
  choice: {
    minHeight: 40,
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
    paddingHorizontal: spacing.sm,
  },
  selectedChoice: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDark,
  },
  choiceLabel: {color: colors.secondaryText, fontSize: 13, fontWeight: '600'},
  selectedChoiceLabel: {color: colors.accent},
  bitrateInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    backgroundColor: colors.raised,
    paddingHorizontal: spacing.md,
  },
  disabled: {opacity: 0.45},
});
