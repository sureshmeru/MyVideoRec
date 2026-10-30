import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useIsFocused} from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, {Circle, Path, Rect, Text as SvgText} from 'react-native-svg';
import Video from 'react-native-video';
import type {VideoRef} from 'react-native-video';
import {SelectedTrackType} from 'react-native-video';

import {colors, spacing} from '../app/theme';
import {Card, Screen} from '../components/Screen';
import {Label, StatusBadge} from '../components/UI';
import {listRecordings, renameRecording} from '../data/database';
import type {Recording} from '../data/models';
import {formatDuration} from './DashboardScreen';
import {shareRecording} from '../features/storage/shareRecording';

const MAX_RECORDING_NAME_LENGTH = 120;
const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const PLAYBACK_POSITION_PREFIX = 'playback-position:';

export function LibraryScreen() {
  const [shareError, setShareError] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerPlaying, setPlayerPlaying] = useState(false);
  const [playerTime, setPlayerTime] = useState(0);
  const [playerDuration, setPlayerDuration] = useState(0);
  const [previewWidth, setPreviewWidth] = useState(0);
  const [playerVolume, setPlayerVolume] = useState(0.8);
  const [playerMuted, setPlayerMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [controlsLocked, setControlsLocked] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [seekInterval, setSeekInterval] = useState(10);
  const [statsVisible, setStatsVisible] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'off' | 'one' | 'all'>('off');
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const [jumpDialogVisible, setJumpDialogVisible] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [speedInput, setSpeedInput] = useState('1');
  const [speedDialogVisible, setSpeedDialogVisible] = useState(false);
  const [audioTracks, setAudioTracks] = useState<
    {index: number; title?: string; language?: string; selected?: boolean}[]
  >([]);
  const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState<
    number | null
  >(null);
  const [resumePrompt, setResumePrompt] = useState<{
    id: string;
    seconds: number;
  } | null>(null);
  const [playerError, setPlayerError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const playerRef = useRef<VideoRef>(null);
  const tapRef = useRef<{time: number; x: number} | null>(null);
  const lastSavedPositionRef = useRef(0);
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  const recordingsQuery = useQuery({
    queryKey: ['recordings'],
    queryFn: listRecordings,
  });
  const renameMutation = useMutation({
    mutationFn: ({id, displayName}: {id: string; displayName: string}) =>
      renameRecording(id, displayName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['recordings']});
      setRenameId(null);
    },
  });

  useEffect(() => {
    if (!isFocused) {
      if (playerId) {
        AsyncStorage.setItem(
          `${PLAYBACK_POSITION_PREFIX}${playerId}`,
          String(playerTime),
        ).catch(error => {
          console.warn('Could not save playback position.', error);
        });
      }
      setPlayerId(null);
      setPlayerPlaying(false);
      setFullscreen(false);
      setControlsLocked(false);
    }
  }, [isFocused, playerId, playerTime]);

  useEffect(() => {
    if (
      playerId &&
      recordingsQuery.data &&
      !recordingsQuery.data.some(recording => recording.id === playerId)
    ) {
      setPlayerId(null);
      setPlayerPlaying(false);
      setFullscreen(false);
      setControlsLocked(false);
    }
  }, [playerId, recordingsQuery.data]);

  const closePlayer = () => {
    if (playerId) {
      AsyncStorage.setItem(
        `${PLAYBACK_POSITION_PREFIX}${playerId}`,
        String(playerTime),
      ).catch(error => {
        console.warn('Could not save playback position.', error);
      });
    }
    setPlayerId(null);
    setPlayerPlaying(false);
    setPlayerTime(0);
    setPlayerDuration(0);
    setFullscreen(false);
    setControlsLocked(false);
  };

  const togglePlayback = () => {
    if (playerPlaying) {
      setPlayerPlaying(false);
      return;
    }
    if (playerDuration > 0 && playerTime >= playerDuration) {
      playerRef.current?.seek(0);
      setPlayerTime(0);
    }
    setPlayerPlaying(true);
  };

  const playRecording = async (recording: Recording) => {
    setPlayerError(null);
    if (playerId !== recording.id) {
      setPlayerId(recording.id);
      setPlayerTime(0);
      setPlayerDuration(0);
      setPlayerVolume(0.8);
      setPlayerMuted(false);
      setPlaybackRate(1);
      setControlsVisible(true);
      setControlsLocked(false);
      setAudioTracks([]);
      setSelectedAudioTrackIndex(null);
      const saved = await AsyncStorage.getItem(
        `${PLAYBACK_POSITION_PREFIX}${recording.id}`,
      );
      const savedPosition = saved ? Number(saved) : 0;
      if (Number.isFinite(savedPosition) && savedPosition > 5) {
        setPlayerTime(savedPosition);
        setResumePrompt({id: recording.id, seconds: savedPosition});
        setPlayerPlaying(false);
        return;
      }
    }
    setPlayerPlaying(true);
  };

  const seekTo = (seconds: number) => {
    const boundedTime = Math.max(0, Math.min(playerDuration, seconds));
    playerRef.current?.seek(boundedTime);
    setPlayerTime(boundedTime);
  };

  const setVolume = (volume: number) => {
    setPlayerVolume(Math.max(0, Math.min(1, volume)));
    setPlayerMuted(false);
  };

  const handlePreviewTap = (x: number, width: number) => {
    const now = Date.now();
    const previousTap = tapRef.current;
    if (previousTap && now - previousTap.time < 320) {
      tapRef.current = null;
      setControlsVisible(true);
      if (previousTap.x < width * 0.4) {
        seekTo(playerTime - 10);
      } else if (previousTap.x > width * 0.6) {
        seekTo(playerTime + 10);
      } else {
        togglePlayback();
      }
      return;
    }
    tapRef.current = {time: now, x};
    setControlsVisible(visible => !visible);
  };

  const seekBy = (seconds: number) => seekTo(playerTime + seconds);
  const cycleSeekInterval = () => {
    setSeekInterval(interval =>
      interval === 5 ? 10 : interval === 10 ? 15 : 5,
    );
  };

  const handlePlayRequest = (recording: Recording) => {
    playRecording(recording).catch(error => {
      setPlayerError({
        id: recording.id,
        message:
          error instanceof Error
            ? error.message
            : 'Playback could not be started.',
      });
    });
  };

  const handlePlaybackEnd = () => {
    if (repeatMode === 'one') {
      playerRef.current?.seek(0);
      setPlayerTime(0);
      setPlayerPlaying(true);
      return;
    }
    if (playerId) {
      AsyncStorage.removeItem(`${PLAYBACK_POSITION_PREFIX}${playerId}`).catch(
        error => {
          console.warn('Could not clear playback position.', error);
        },
      );
    }
    const list = recordingsQuery.data ?? [];
    const currentIndex = list.findIndex(item => item.id === playerId);
    if (shuffleEnabled && list.length > 1) {
      const candidates = list.filter(item => item.id !== playerId);
      startRecordingPlayback(
        candidates[Math.floor(Math.random() * candidates.length)],
      );
      return;
    }
    if (currentIndex >= 0 && currentIndex < list.length - 1) {
      startRecordingPlayback(list[currentIndex + 1]);
      return;
    }
    if (repeatMode === 'all' && list.length > 0) {
      startRecordingPlayback(list[0]);
      return;
    }
    setPlayerPlaying(false);
    setPlayerTime(playerDuration);
  };

  const startRecordingPlayback = (recording: Recording) => {
    setPlayerError(null);
    setResumePrompt(null);
    setPlayerId(recording.id);
    setPlayerTime(0);
    setPlayerDuration(0);
    setPlayerPlaying(true);
    setControlsVisible(true);
    setControlsLocked(false);
    setPlaybackRate(1);
    setPlayerMuted(false);
    setAudioTracks([]);
    setSelectedAudioTrackIndex(null);
    setBookmarks([]);
    setLoopA(null);
    setLoopB(null);
    lastSavedPositionRef.current = 0;
  };

  const moveToRecording = (direction: -1 | 1) => {
    const list = recordingsQuery.data ?? [];
    const currentIndex = list.findIndex(item => item.id === playerId);
    if (direction === -1 && playerTime > 3) {
      seekTo(0);
      return;
    }
    const nextIndex = currentIndex + direction;
    if (currentIndex >= 0 && nextIndex >= 0 && nextIndex < list.length) {
      startRecordingPlayback(list[nextIndex]);
    }
  };

  const cyclePlaybackSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate);
    setPlaybackRate(
      PLAYBACK_SPEEDS[(currentIndex + 1) % PLAYBACK_SPEEDS.length],
    );
  };

  const stepFrame = (direction: -1 | 1) => {
    setPlayerPlaying(false);
    seekBy(direction / 30);
  };

  const commitCustomSpeed = () => {
    const requestedRate = Number(speedInput);
    if (
      Number.isFinite(requestedRate) &&
      requestedRate >= 0.25 &&
      requestedRate <= 3
    ) {
      setPlaybackRate(requestedRate);
      setSpeedDialogVisible(false);
    }
  };

  const commitTimestampJump = () => {
    const parts = jumpInput.trim().split(':').map(Number);
    if (
      !parts.length ||
      parts.some(part => !Number.isFinite(part) || part < 0)
    ) {
      return;
    }
    const seconds =
      parts.length === 3
        ? parts[0] * 3600 + parts[1] * 60 + parts[2]
        : parts.length === 2
        ? parts[0] * 60 + parts[1]
        : parts[0];
    seekTo(seconds);
    setJumpDialogVisible(false);
  };

  const handleProgress = (currentTime: number) => {
    if (
      loopA !== null &&
      loopB !== null &&
      loopB > loopA &&
      currentTime >= loopB
    ) {
      playerRef.current?.seek(loopA);
      setPlayerTime(loopA);
      return;
    }
    setPlayerTime(currentTime);
    if (playerId && currentTime - lastSavedPositionRef.current >= 3) {
      lastSavedPositionRef.current = currentTime;
      AsyncStorage.setItem(
        `${PLAYBACK_POSITION_PREFIX}${playerId}`,
        String(currentTime),
      ).catch(error => {
        console.warn('Could not save playback position.', error);
      });
    }
  };

  useEffect(() => {
    if (!playerPlaying || !controlsVisible) {
      return;
    }
    const timeout = setTimeout(() => setControlsVisible(false), 3500);
    return () => clearTimeout(timeout);
  }, [playerPlaying, controlsVisible]);

  const handleShare = async (recording: Recording) => {
    setShareError(null);
    setSharingId(recording.id);
    try {
      await shareRecording(recording);
    } catch (error) {
      setShareError(
        error instanceof Error
          ? error.message
          : 'The clip could not be shared.',
      );
    } finally {
      setSharingId(null);
    }
  };

  return (
    <Screen
      title="Videos"
      subtitle="Local recordings stay on this device until you export or delete them.">
      {recordingsQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : recordingsQuery.isError ? (
        <Card>
          <Label color={colors.danger}>
            Unable to read the video library: {recordingsQuery.error.message}
          </Label>
        </Card>
      ) : recordingsQuery.data?.length ? (
        recordingsQuery.data.map(recording => {
          const isPlayerVisible = playerId === recording.id;
          return (
            <Card key={recording.id} style={styles.clipCard}>
              <View
                style={[
                  styles.preview,
                  isPlayerVisible && styles.activePreview,
                ]}
                onLayout={event =>
                  setPreviewWidth(event.nativeEvent.layout.width)
                }>
                {isPlayerVisible && !fullscreen ? (
                  <Video
                    key={recording.id}
                    ref={playerRef}
                    source={{uri: recording.localUri}}
                    style={StyleSheet.absoluteFill}
                    paused={!playerPlaying}
                    muted={playerMuted}
                    volume={playerVolume}
                    rate={playbackRate}
                    selectedAudioTrack={
                      selectedAudioTrackIndex === null
                        ? undefined
                        : {
                            type: SelectedTrackType.INDEX,
                            value: selectedAudioTrackIndex,
                          }
                    }
                    controls={false}
                    resizeMode="cover"
                    progressUpdateInterval={250}
                    preventsDisplaySleepDuringVideoPlayback
                    onLoad={event => {
                      setPlayerDuration(event.duration);
                      setAudioTracks(event.audioTracks);
                      if (playerTime > 0) {
                        playerRef.current?.seek(playerTime);
                      }
                    }}
                    onAudioTracks={event => setAudioTracks(event.audioTracks)}
                    onProgress={event => handleProgress(event.currentTime)}
                    onEnd={handlePlaybackEnd}
                    onError={error => {
                      closePlayer();
                      setPlayerError({
                        id: recording.id,
                        message:
                          error.error.errorString ??
                          'This video file could not be played.',
                      });
                    }}
                  />
                ) : null}
                {isPlayerVisible && !fullscreen ? (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Show or hide video controls; double-tap the sides to seek"
                      style={StyleSheet.absoluteFill}
                      onPress={event => {
                        if (controlsLocked) {
                          setControlsVisible(true);
                        } else {
                          handlePreviewTap(
                            event.nativeEvent.locationX,
                            previewWidth,
                          );
                        }
                      }}
                    />
                    {controlsVisible ? (
                      <PlaybackOverlay
                        style={StyleSheet.absoluteFill}
                        title={recording.displayName}
                        playing={playerPlaying}
                        currentTime={playerTime}
                        duration={playerDuration}
                        muted={playerMuted}
                        volume={playerVolume}
                        rate={playbackRate}
                        locked={controlsLocked}
                        previousDisabled={
                          (recordingsQuery.data?.findIndex(
                            item => item.id === playerId,
                          ) ?? 0) <= 0
                        }
                        nextDisabled={
                          (recordingsQuery.data?.findIndex(
                            item => item.id === playerId,
                          ) ?? -1) >=
                          (recordingsQuery.data?.length ?? 0) - 1
                        }
                        hasAudioTracks={audioTracks.length > 1}
                        audioTrackLabel={getAudioTrackLabel(
                          audioTracks,
                          selectedAudioTrackIndex,
                        )}
                        onTogglePlayback={togglePlayback}
                        onSeek={seekTo}
                        onSeekBy={seconds =>
                          seekBy(Math.sign(seconds) * seekInterval)
                        }
                        onFrameStep={stepFrame}
                        onPrevious={() => moveToRecording(-1)}
                        onNext={() => moveToRecording(1)}
                        onToggleMute={() => setPlayerMuted(muted => !muted)}
                        onVolumeChange={setVolume}
                        onCycleSpeed={cyclePlaybackSpeed}
                        onCustomSpeed={() => {
                          setSpeedInput(String(playbackRate));
                          setSpeedDialogVisible(true);
                        }}
                        onCycleAudioTrack={() => {
                          const currentIndex = audioTracks.findIndex(
                            track => track.index === selectedAudioTrackIndex,
                          );
                          const nextTrack =
                            audioTracks[
                              (currentIndex + 1) % audioTracks.length
                            ];
                          setSelectedAudioTrackIndex(nextTrack?.index ?? null);
                        }}
                        repeatMode={repeatMode}
                        shuffleEnabled={shuffleEnabled}
                        onCycleRepeat={() =>
                          setRepeatMode(mode =>
                            mode === 'off'
                              ? 'one'
                              : mode === 'one'
                              ? 'all'
                              : 'off',
                          )
                        }
                        onToggleShuffle={() =>
                          setShuffleEnabled(enabled => !enabled)
                        }
                        onJump={() => {
                          setJumpInput(formatPlayerTime(playerTime));
                          setJumpDialogVisible(true);
                        }}
                        onAddBookmark={() =>
                          setBookmarks(current => [...current, playerTime])
                        }
                        bookmarks={bookmarks}
                        onSeekBookmark={seekTo}
                        loopA={loopA}
                        loopB={loopB}
                        onSetLoopA={() => setLoopA(playerTime)}
                        onSetLoopB={() => setLoopB(playerTime)}
                        onClearLoop={() => {
                          setLoopA(null);
                          setLoopB(null);
                        }}
                        seekInterval={seekInterval}
                        statsVisible={statsVisible}
                        statsText={`${recording.width}×${recording.height} · ${recording.frameRate} fps · ${playbackRate}×`}
                        onCycleSeekInterval={cycleSeekInterval}
                        onToggleStats={() =>
                          setStatsVisible(visible => !visible)
                        }
                        onToggleFullscreen={() => setFullscreen(true)}
                        onToggleLock={() =>
                          setControlsLocked(locked => !locked)
                        }
                        onClose={closePlayer}
                      />
                    ) : null}
                  </>
                ) : null}
                {!isPlayerVisible ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Play ${recording.displayName}`}
                    onPress={() => handlePlayRequest(recording)}
                    style={({pressed}) => [
                      styles.previewOverlay,
                      pressed && styles.previewPressed,
                    ]}>
                    <VideoIcon name="play" color={colors.text} size={30} />
                    <Text style={styles.previewHint}>
                      {playerError?.id === recording.id
                        ? playerError.message
                        : 'Tap to play preview'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.clipHeading}>
                <View style={styles.clipCopy}>
                  <Text style={styles.clipTitle} numberOfLines={2}>
                    {recording.displayName}
                  </Text>
                  <Label>
                    {formatDuration(recording.durationSeconds)} ·{' '}
                    {formatRecordedAt(recording.startTime)}
                  </Label>
                  <Label>
                    {recording.cameraPosition === 'back' ? 'Rear' : 'Front'} ·{' '}
                    {recording.width} × {recording.height} ·{' '}
                    {recording.frameRate} fps ·{' '}
                    {(recording.fileSizeBytes / 1024 ** 2).toFixed(1)} MB
                  </Label>
                </View>
                <StatusBadge
                  label={
                    recording.protected
                      ? 'PROTECTED'
                      : recording.uploadStatus.toUpperCase()
                  }
                  tone={recording.protected ? 'warning' : 'neutral'}
                />
              </View>

              <View style={styles.actionRow}>
                <IconButton
                  label={`Share or export ${recording.displayName}`}
                  onPress={() => handleShare(recording)}
                  disabled={sharingId === recording.id}>
                  <VideoIcon name="share" />
                </IconButton>
                <IconButton
                  label={`Rename ${recording.displayName}`}
                  onPress={() => {
                    setRenameId(recording.id);
                    setRenameValue(recording.displayName);
                  }}
                  disabled={false}>
                  <VideoIcon name="edit" />
                </IconButton>
              </View>
              {isPlayerVisible && fullscreen ? (
                <Modal
                  visible
                  animationType="fade"
                  supportedOrientations={['portrait', 'landscape']}
                  onRequestClose={() => setFullscreen(false)}>
                  <View
                    style={styles.fullscreenContainer}
                    onLayout={event =>
                      setPreviewWidth(event.nativeEvent.layout.width)
                    }>
                    <Video
                      key={recording.id}
                      ref={playerRef}
                      source={{uri: recording.localUri}}
                      style={StyleSheet.absoluteFill}
                      paused={!playerPlaying}
                      muted={playerMuted}
                      volume={playerVolume}
                      rate={playbackRate}
                      selectedAudioTrack={
                        selectedAudioTrackIndex === null
                          ? undefined
                          : {
                              type: SelectedTrackType.INDEX,
                              value: selectedAudioTrackIndex,
                            }
                      }
                      controls={false}
                      resizeMode="contain"
                      progressUpdateInterval={250}
                      preventsDisplaySleepDuringVideoPlayback
                      onLoad={event => {
                        setPlayerDuration(event.duration);
                        setAudioTracks(event.audioTracks);
                        if (playerTime > 0) {
                          playerRef.current?.seek(playerTime);
                        }
                      }}
                      onAudioTracks={event => setAudioTracks(event.audioTracks)}
                      onProgress={event => handleProgress(event.currentTime)}
                      onEnd={handlePlaybackEnd}
                      onError={error => {
                        setFullscreen(false);
                        closePlayer();
                        setPlayerError({
                          id: recording.id,
                          message:
                            error.error.errorString ??
                            'This video file could not be played.',
                        });
                      }}
                    />
                    <Pressable
                      style={StyleSheet.absoluteFill}
                      accessibilityRole="button"
                      accessibilityLabel="Show or hide video controls; double-tap the sides to seek"
                      onPress={event => {
                        if (controlsLocked) {
                          setControlsVisible(true);
                        } else {
                          handlePreviewTap(
                            event.nativeEvent.locationX,
                            previewWidth,
                          );
                        }
                      }}
                    />
                    {controlsVisible ? (
                      <PlaybackOverlay
                        style={StyleSheet.absoluteFill}
                        title={recording.displayName}
                        playing={playerPlaying}
                        currentTime={playerTime}
                        duration={playerDuration}
                        muted={playerMuted}
                        volume={playerVolume}
                        rate={playbackRate}
                        locked={controlsLocked}
                        previousDisabled={
                          (recordingsQuery.data?.findIndex(
                            item => item.id === playerId,
                          ) ?? 0) <= 0
                        }
                        nextDisabled={
                          (recordingsQuery.data?.findIndex(
                            item => item.id === playerId,
                          ) ?? -1) >=
                          (recordingsQuery.data?.length ?? 0) - 1
                        }
                        hasAudioTracks={audioTracks.length > 1}
                        audioTrackLabel={getAudioTrackLabel(
                          audioTracks,
                          selectedAudioTrackIndex,
                        )}
                        onTogglePlayback={togglePlayback}
                        onSeek={seekTo}
                        onSeekBy={seconds =>
                          seekBy(Math.sign(seconds) * seekInterval)
                        }
                        onFrameStep={stepFrame}
                        onPrevious={() => moveToRecording(-1)}
                        onNext={() => moveToRecording(1)}
                        onToggleMute={() => setPlayerMuted(muted => !muted)}
                        onVolumeChange={setVolume}
                        onCycleSpeed={cyclePlaybackSpeed}
                        onCustomSpeed={() => {
                          setSpeedInput(String(playbackRate));
                          setSpeedDialogVisible(true);
                        }}
                        onCycleAudioTrack={() => {
                          const currentIndex = audioTracks.findIndex(
                            track => track.index === selectedAudioTrackIndex,
                          );
                          const nextTrack =
                            audioTracks[
                              (currentIndex + 1) % audioTracks.length
                            ];
                          setSelectedAudioTrackIndex(nextTrack?.index ?? null);
                        }}
                        repeatMode={repeatMode}
                        shuffleEnabled={shuffleEnabled}
                        onCycleRepeat={() =>
                          setRepeatMode(mode =>
                            mode === 'off'
                              ? 'one'
                              : mode === 'one'
                              ? 'all'
                              : 'off',
                          )
                        }
                        onToggleShuffle={() =>
                          setShuffleEnabled(enabled => !enabled)
                        }
                        onJump={() => {
                          setJumpInput(formatPlayerTime(playerTime));
                          setJumpDialogVisible(true);
                        }}
                        onAddBookmark={() =>
                          setBookmarks(current => [...current, playerTime])
                        }
                        bookmarks={bookmarks}
                        onSeekBookmark={seekTo}
                        loopA={loopA}
                        loopB={loopB}
                        onSetLoopA={() => setLoopA(playerTime)}
                        onSetLoopB={() => setLoopB(playerTime)}
                        onClearLoop={() => {
                          setLoopA(null);
                          setLoopB(null);
                        }}
                        seekInterval={seekInterval}
                        statsVisible={statsVisible}
                        statsText={`${recording.width}×${recording.height} · ${recording.frameRate} fps · ${playbackRate}×`}
                        onCycleSeekInterval={cycleSeekInterval}
                        onToggleStats={() =>
                          setStatsVisible(visible => !visible)
                        }
                        onToggleFullscreen={() => setFullscreen(false)}
                        onToggleLock={() =>
                          setControlsLocked(locked => !locked)
                        }
                        onClose={closePlayer}
                      />
                    ) : null}
                  </View>
                </Modal>
              ) : null}
            </Card>
          );
        })
      ) : (
        <Card>
          <Text style={styles.clipTitle}>No recordings yet</Text>
          <Label>Start a recording to create your first local clip.</Label>
        </Card>
      )}
      {shareError ? <Label color={colors.danger}>{shareError}</Label> : null}
      {renameMutation.isError ? (
        <Label color={colors.danger}>{renameMutation.error.message}</Label>
      ) : null}
      <Modal
        visible={renameId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameId(null)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.renameDialog}>
            <Text style={styles.clipTitle}>Rename clip</Text>
            <TextInput
              accessibilityLabel="Clip name"
              value={renameValue}
              onChangeText={setRenameValue}
              maxLength={MAX_RECORDING_NAME_LENGTH}
              autoFocus
              style={styles.nameInput}
              placeholder="Clip name"
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
            />
            <Text style={styles.characterCount}>
              {renameValue.length}/{MAX_RECORDING_NAME_LENGTH}
            </Text>
            <View style={styles.renameActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel rename"
                onPress={() => setRenameId(null)}
                style={styles.dialogButton}>
                <Text style={styles.dialogButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save clip name"
                onPress={() => {
                  if (renameId) {
                    renameMutation.mutate({
                      id: renameId,
                      displayName: renameValue,
                    });
                  }
                }}
                disabled={!renameValue.trim() || renameMutation.isPending}
                style={[
                  styles.dialogButton,
                  styles.saveButton,
                  (!renameValue.trim() || renameMutation.isPending) &&
                    styles.disabledButton,
                ]}>
                <Text style={styles.saveButtonText}>
                  {renameMutation.isPending ? 'Saving…' : 'Save name'}
                </Text>
              </Pressable>
            </View>
          </Card>
        </View>
      </Modal>
      <Modal
        visible={speedDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSpeedDialogVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.renameDialog}>
            <Text style={styles.clipTitle}>Custom playback speed</Text>
            <TextInput
              accessibilityLabel="Playback speed"
              value={speedInput}
              onChangeText={setSpeedInput}
              keyboardType="decimal-pad"
              selectTextOnFocus
              style={styles.nameInput}
              placeholder="0.25 to 3"
              placeholderTextColor={colors.muted}
            />
            <Label>
              Supported range: 0.25×–3×. Audio pitch may vary with playback
              speed.
            </Label>
            <View style={styles.renameActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSpeedDialogVisible(false)}
                style={styles.dialogButton}>
                <Text style={styles.dialogButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={commitCustomSpeed}
                style={[styles.dialogButton, styles.saveButton]}>
                <Text style={styles.saveButtonText}>Apply speed</Text>
              </Pressable>
            </View>
          </Card>
        </View>
      </Modal>
      <Modal
        visible={jumpDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setJumpDialogVisible(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.renameDialog}>
            <Text style={styles.clipTitle}>Jump to time</Text>
            <TextInput
              accessibilityLabel="Timestamp"
              value={jumpInput}
              onChangeText={setJumpInput}
              keyboardType="decimal-pad"
              style={styles.nameInput}
              placeholder="hh:mm:ss"
              placeholderTextColor={colors.muted}
            />
            <View style={styles.renameActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setJumpDialogVisible(false)}
                style={styles.dialogButton}>
                <Text style={styles.dialogButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={commitTimestampJump}
                style={[styles.dialogButton, styles.saveButton]}>
                <Text style={styles.saveButtonText}>Jump</Text>
              </Pressable>
            </View>
          </Card>
        </View>
      </Modal>
      <Modal
        visible={resumePrompt !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setResumePrompt(null);
          setPlayerId(null);
          setPlayerPlaying(false);
        }}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.renameDialog}>
            <Text style={styles.clipTitle}>Resume playback?</Text>
            <Label>
              A saved position is available at{' '}
              {formatPlayerTime(resumePrompt?.seconds ?? 0)}.
            </Label>
            <View style={styles.renameActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (resumePrompt) {
                    AsyncStorage.removeItem(
                      `${PLAYBACK_POSITION_PREFIX}${resumePrompt.id}`,
                    ).catch(error => {
                      console.warn('Could not clear playback position.', error);
                    });
                    playerRef.current?.seek(0);
                    setPlayerTime(0);
                    setResumePrompt(null);
                    setPlayerPlaying(true);
                  }
                }}
                style={styles.dialogButton}>
                <Text style={styles.dialogButtonText}>Start over</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  if (resumePrompt) {
                    playerRef.current?.seek(resumePrompt.seconds);
                  }
                  setResumePrompt(null);
                  setPlayerPlaying(true);
                }}
                style={[styles.dialogButton, styles.saveButton]}>
                <Text style={styles.saveButtonText}>Resume</Text>
              </Pressable>
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

function IconButton({
  label,
  onPress,
  disabled,
  children,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({pressed}) => [
        styles.iconButton,
        compact && styles.compactIconButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.iconButtonPressed,
      ]}>
      {children}
    </Pressable>
  );
}

function PlaybackOverlay({
  title,
  playing,
  currentTime,
  duration,
  muted,
  volume,
  rate,
  locked,
  previousDisabled,
  nextDisabled,
  hasAudioTracks,
  audioTrackLabel,
  seekInterval,
  statsVisible,
  statsText,
  repeatMode,
  shuffleEnabled,
  onTogglePlayback,
  onSeek,
  onSeekBy,
  onFrameStep,
  onPrevious,
  onNext,
  onToggleMute,
  onVolumeChange,
  onCycleSpeed,
  onCustomSpeed,
  onCycleAudioTrack,
  onCycleRepeat,
  onToggleShuffle,
  onJump,
  onAddBookmark,
  bookmarks,
  onSeekBookmark,
  loopA,
  loopB,
  onSetLoopA,
  onSetLoopB,
  onClearLoop,
  onCycleSeekInterval,
  onToggleStats,
  onToggleFullscreen,
  onToggleLock,
  onClose,
  style,
}: {
  title: string;
  playing: boolean;
  currentTime: number;
  duration: number;
  muted: boolean;
  volume: number;
  rate: number;
  locked: boolean;
  previousDisabled: boolean;
  nextDisabled: boolean;
  hasAudioTracks: boolean;
  audioTrackLabel: string;
  seekInterval: number;
  statsVisible: boolean;
  statsText: string;
  repeatMode: 'off' | 'one' | 'all';
  shuffleEnabled: boolean;
  onTogglePlayback: () => void;
  onSeek: (seconds: number) => void;
  onSeekBy: (seconds: number) => void;
  onFrameStep: (direction: -1 | 1) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onCycleSpeed: () => void;
  onCustomSpeed: () => void;
  onCycleAudioTrack: () => void;
  onCycleRepeat: () => void;
  onToggleShuffle: () => void;
  onJump: () => void;
  onAddBookmark: () => void;
  bookmarks: number[];
  onSeekBookmark: (time: number) => void;
  loopA: number | null;
  loopB: number | null;
  onSetLoopA: () => void;
  onSetLoopB: () => void;
  onClearLoop: () => void;
  onCycleSeekInterval: () => void;
  onToggleStats: () => void;
  onToggleFullscreen: () => void;
  onToggleLock: () => void;
  onClose: () => void;
  style?: object;
}) {
  return (
    <View style={[styles.playerOverlay, style]}>
      <View style={styles.playerTopRow}>
        {locked ? (
          <IconButton
            label="Unlock playback controls"
            onPress={onToggleLock}
            disabled={false}
            compact>
            <VideoIcon name="unlock" />
          </IconButton>
        ) : (
          <>
            <Text style={styles.playerTitle} numberOfLines={1}>
              {title}
            </Text>
            <IconButton
              label={
                statsVisible
                  ? 'Hide playback statistics'
                  : 'Show playback statistics'
              }
              onPress={onToggleStats}
              disabled={false}
              compact>
              <VideoIcon name="stats" />
            </IconButton>
            <IconButton
              label="Lock playback controls"
              onPress={onToggleLock}
              disabled={false}
              compact>
              <VideoIcon name="lock" />
            </IconButton>
            <IconButton
              label="Close player"
              onPress={onClose}
              disabled={false}
              compact>
              <VideoIcon name="close" />
            </IconButton>
          </>
        )}
      </View>
      {!locked ? (
        <View style={styles.playerBottomControls}>
          {statsVisible ? (
            <Text style={styles.statsText}>{statsText}</Text>
          ) : null}
          <View style={styles.transportRow}>
            <IconButton
              label="Previous video"
              onPress={onPrevious}
              disabled={previousDisabled}
              compact>
              <VideoIcon name="previous" />
            </IconButton>
            <IconButton
              label={`Seek backward ${seekInterval} seconds`}
              onPress={() => onSeekBy(-10)}
              disabled={false}
              compact>
              <VideoIcon name="back10" />
            </IconButton>
            <IconButton
              label="Play frame backward"
              onPress={() => onFrameStep(-1)}
              disabled={false}
              compact>
              <VideoIcon name="frameBack" />
            </IconButton>
            <IconButton
              label={playing ? 'Pause video' : 'Play video'}
              onPress={onTogglePlayback}
              disabled={false}>
              <VideoIcon
                name={playing ? 'pause' : 'play'}
                color={colors.text}
              />
            </IconButton>
            <IconButton
              label="Play frame forward"
              onPress={() => onFrameStep(1)}
              disabled={false}
              compact>
              <VideoIcon name="frameForward" />
            </IconButton>
            <IconButton
              label={`Seek forward ${seekInterval} seconds`}
              onPress={() => onSeekBy(10)}
              disabled={false}
              compact>
              <VideoIcon name="forward10" />
            </IconButton>
            <IconButton
              label="Next video"
              onPress={onNext}
              disabled={nextDisabled}
              compact>
              <VideoIcon name="next" />
            </IconButton>
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatPlayerTime(currentTime)}</Text>
            <Text style={styles.timeText}>{formatPlayerTime(duration)}</Text>
          </View>
          <ValueSlider
            accessibilityLabel="Video position"
            value={currentTime}
            maximum={duration}
            onChange={onSeek}
            disabled={duration <= 0}
          />
          <View style={styles.playerOptionRow}>
            <IconButton
              label={muted ? 'Unmute video' : 'Mute video'}
              onPress={onToggleMute}
              disabled={false}
              compact>
              <VideoIcon name={muted || volume === 0 ? 'muted' : 'volume'} />
            </IconButton>
            <ValueSlider
              accessibilityLabel="Playback volume"
              value={muted ? 0 : volume}
              maximum={1}
              onChange={onVolumeChange}
              width={78}
              formatValue={value => `${Math.round(value * 100)}%`}
            />
            <Text style={styles.volumeText}>
              {Math.round((muted ? 0 : volume) * 100)}%
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Playback speed ${rate} times. Tap to change; long press for custom speed.`}
              onPress={onCycleSpeed}
              onLongPress={onCustomSpeed}
              style={styles.speedButton}>
              <Text style={styles.speedText}>{rate}×</Text>
            </Pressable>
            {hasAudioTracks ? (
              <IconButton
                label={`Switch audio track. Current track: ${audioTrackLabel}`}
                onPress={onCycleAudioTrack}
                disabled={false}
                compact>
                <VideoIcon name="audioTrack" />
              </IconButton>
            ) : null}
            {hasAudioTracks ? (
              <Text style={styles.audioTrackLabel} numberOfLines={1}>
                {audioTrackLabel}
              </Text>
            ) : null}
            <IconButton
              label={`Repeat ${repeatMode}`}
              onPress={onCycleRepeat}
              disabled={false}
              compact>
              <VideoIcon name={repeatMode === 'off' ? 'repeat' : 'repeatOne'} />
            </IconButton>
            <IconButton
              label={shuffleEnabled ? 'Disable shuffle' : 'Enable shuffle'}
              onPress={onToggleShuffle}
              disabled={false}
              compact>
              <VideoIcon name="shuffle" />
            </IconButton>
            <IconButton
              label="View full screen"
              onPress={onToggleFullscreen}
              disabled={false}
              compact>
              <VideoIcon name="fullscreen" />
            </IconButton>
          </View>
          <View style={styles.utilityRow}>
            <Text style={styles.loopText}>
              {loopA === null ? 'A —' : `A ${formatPlayerTime(loopA)}`}
              {'  '}
              {loopB === null ? 'B —' : `B ${formatPlayerTime(loopB)}`}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set loop start"
              onPress={onSetLoopA}
              style={styles.utilityButton}>
              <Text style={styles.utilityText}>A</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set loop end"
              onPress={onSetLoopB}
              style={styles.utilityButton}>
              <Text style={styles.utilityText}>B</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear A-B loop"
              onPress={onClearLoop}
              style={styles.utilityButton}>
              <Text style={styles.utilityText}>A-B</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Jump to timestamp"
              onPress={onJump}
              style={styles.utilityButton}>
              <Text style={styles.utilityText}>Go to</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Bookmark current timestamp"
              onPress={onAddBookmark}
              style={styles.utilityButton}>
              <Text style={styles.utilityText}>Mark</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Seek interval ${seekInterval} seconds. Tap to change.`}
              onPress={onCycleSeekInterval}
              style={styles.utilityButton}>
              <Text style={styles.utilityText}>±{seekInterval}s</Text>
            </Pressable>
          </View>
          {bookmarks.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bookmarkRow}>
              {bookmarks.map((bookmark, index) => (
                <Pressable
                  key={`${bookmark}-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Seek to bookmark ${formatPlayerTime(
                    bookmark,
                  )}`}
                  onPress={() => onSeekBookmark(bookmark)}
                  style={styles.utilityButton}>
                  <Text style={styles.utilityText}>
                    {formatPlayerTime(bookmark)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : (
        <Text style={styles.lockHint}>Playback controls locked</Text>
      )}
    </View>
  );
}

function ValueSlider({
  accessibilityLabel,
  value,
  maximum,
  onChange,
  disabled = false,
  width,
  formatValue,
}: {
  accessibilityLabel: string;
  value: number;
  maximum: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  width?: number;
  formatValue?: (value: number) => string;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const safeMaximum = Math.max(0, maximum);
  const boundedValue = Math.max(0, Math.min(safeMaximum, value));
  const progress = safeMaximum > 0 ? boundedValue / safeMaximum : 0;
  const changeFromX = (x: number) => {
    if (trackWidth > 0 && !disabled) {
      onChange(
        (Math.max(0, Math.min(trackWidth, x)) / trackWidth) * safeMaximum,
      );
    }
  };
  const handleLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      style={[styles.sliderContainer, width ? {width} : null]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{
        min: 0,
        max: safeMaximum,
        now: boundedValue,
        text: formatValue?.(boundedValue),
      }}
      accessibilityActions={[{name: 'increment'}, {name: 'decrement'}]}
      onAccessibilityAction={event => {
        const adjustment = safeMaximum > 1 ? 5 : 0.05;
        if (event.nativeEvent.actionName === 'increment') {
          onChange(Math.min(safeMaximum, boundedValue + adjustment));
        } else if (event.nativeEvent.actionName === 'decrement') {
          onChange(Math.max(0, boundedValue - adjustment));
        }
      }}
      onLayout={handleLayout}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={event => changeFromX(event.nativeEvent.locationX)}
      onResponderMove={event => changeFromX(event.nativeEvent.locationX)}
      onResponderRelease={event => changeFromX(event.nativeEvent.locationX)}>
      <View style={[styles.sliderTrack, disabled && styles.sliderDisabled]}>
        <View style={[styles.sliderProgress, {width: `${progress * 100}%`}]} />
        <View style={[styles.sliderThumb, {left: `${progress * 100}%`}]} />
      </View>
    </View>
  );
}

function formatPlayerTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
        2,
        '0',
      )}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(
        2,
        '0',
      )}`;
}

function getAudioTrackLabel(
  tracks: {
    index: number;
    title?: string;
    language?: string;
    selected?: boolean;
  }[],
  selectedIndex: number | null,
): string {
  const track =
    tracks.find(item => item.index === selectedIndex) ??
    tracks.find(item => item.selected) ??
    tracks[0];
  return track?.title || track?.language || 'Audio';
}

function VideoIcon({
  name,
  color = colors.accent,
  size = 22,
}: {
  name:
    | 'play'
    | 'pause'
    | 'share'
    | 'edit'
    | 'muted'
    | 'volume'
    | 'fullscreen'
    | 'shrink'
    | 'close'
    | 'previous'
    | 'next'
    | 'back10'
    | 'forward10'
    | 'frameBack'
    | 'frameForward'
    | 'audioTrack'
    | 'lock'
    | 'unlock'
    | 'repeat'
    | 'repeatOne'
    | 'shuffle'
    | 'stats';
  color?: string;
  size?: number;
}) {
  const iconProps = {
    fill: 'none',
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 2,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'play' ? (
        <Path
          {...iconProps}
          fill={color}
          stroke="none"
          d="M7 4.8v14.4L19 12z"
        />
      ) : name === 'pause' ? (
        <>
          <Rect {...iconProps} x="6" y="4" width="4" height="16" rx="1" />
          <Rect {...iconProps} x="14" y="4" width="4" height="16" rx="1" />
        </>
      ) : name === 'share' ? (
        <>
          <Path {...iconProps} d="m8 12 8-5M8 12l8 5" />
          <Circle {...iconProps} cx="6" cy="12" r="2.5" />
          <Circle {...iconProps} cx="18" cy="5.5" r="2.5" />
          <Circle {...iconProps} cx="18" cy="18.5" r="2.5" />
        </>
      ) : name === 'edit' ? (
        <>
          <Path {...iconProps} d="m4 16.5-.8 4.3 4.3-.8L20 7.5 16.5 4z" />
          <Path {...iconProps} d="m14.8 5.7 3.5 3.5" />
        </>
      ) : name === 'previous' ? (
        <>
          <Path {...iconProps} d="M6 5v14" />
          <Path {...iconProps} fill={color} d="m18 5-10 7 10 7z" />
        </>
      ) : name === 'next' ? (
        <>
          <Path {...iconProps} d="M18 5v14" />
          <Path {...iconProps} fill={color} d="m6 5 10 7-10 7z" />
        </>
      ) : name === 'back10' || name === 'forward10' ? (
        <>
          <Path
            {...iconProps}
            d={
              name === 'back10'
                ? 'M5 8H2V5M3 8a9 9 0 1 1-1 6'
                : 'M19 8h3V5m-1 3a9 9 0 1 0 1 6'
            }
          />
          <Path
            {...iconProps}
            d={name === 'back10' ? 'M12 8v4l-2 2' : 'M12 8v4l2 2'}
          />
          <SvgText x="12" y="21" fill={color} fontSize="6" textAnchor="middle">
            10
          </SvgText>
        </>
      ) : name === 'frameBack' || name === 'frameForward' ? (
        <Path
          {...iconProps}
          d={
            name === 'frameBack'
              ? 'M7 5v14M19 5l-10 7 10 7'
              : 'M17 5v14M5 5l10 7-10 7'
          }
        />
      ) : name === 'audioTrack' ? (
        <>
          <Path {...iconProps} d="M4 10v4h4l5 4V6l-5 4z" />
          <Path {...iconProps} d="M17 9v6m3-6v6" />
        </>
      ) : name === 'lock' ? (
        <>
          <Rect {...iconProps} x="5" y="10" width="14" height="11" rx="2" />
          <Path {...iconProps} d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      ) : name === 'unlock' ? (
        <>
          <Rect {...iconProps} x="5" y="10" width="14" height="11" rx="2" />
          <Path {...iconProps} d="M8 10V7a4 4 0 0 1 7-2" />
        </>
      ) : name === 'repeat' || name === 'repeatOne' ? (
        <>
          <Path
            {...iconProps}
            d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"
          />
          {name === 'repeatOne' ? (
            <SvgText
              x="12"
              y="14"
              fill={color}
              fontSize="7"
              textAnchor="middle">
              1
            </SvgText>
          ) : null}
        </>
      ) : name === 'shuffle' ? (
        <Path
          {...iconProps}
          d="m16 3 5 0v5m0-5-7 7M4 20l7-7m0 0L4 6m7 7h3a7 7 0 0 1 7 7m-5 1 5-1-1-5"
        />
      ) : name === 'stats' ? (
        <Path {...iconProps} d="M4 20h17M6 17v-5m5 5V6m5 11v-8m5 8v-4" />
      ) : name === 'volume' || name === 'muted' ? (
        <>
          <Path {...iconProps} d="M4 10v4h4l5 4V6l-5 4z" />
          {name === 'volume' ? (
            <Path {...iconProps} d="M16 9a5 5 0 0 1 0 6m2-9a9 9 0 0 1 0 12" />
          ) : (
            <Path {...iconProps} d="m16 9 5 6m0-6-5 6" />
          )}
        </>
      ) : name === 'fullscreen' ? (
        <Path {...iconProps} d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
      ) : name === 'shrink' ? (
        <Path {...iconProps} d="M8 3v5H3m13-5v5h5M3 16h5v5m13-5h-5v5" />
      ) : (
        <Path {...iconProps} d="m6 6 12 12M18 6 6 18" />
      )}
    </Svg>
  );
}

function formatRecordedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString();
}

const styles = StyleSheet.create({
  clipCard: {gap: spacing.md},
  preview: {
    height: 190,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#020508',
  },
  activePreview: {height: 280},
  previewPressed: {opacity: 0.88},
  previewOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#00000066',
  },
  previewHint: {
    maxWidth: '90%',
    color: colors.text,
    fontSize: 12,
    textAlign: 'center',
  },
  clipHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  clipCopy: {flex: 1, gap: 5},
  clipTitle: {color: colors.text, fontSize: 15, fontWeight: '700'},
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.raised,
  },
  iconButtonPressed: {opacity: 0.72, backgroundColor: colors.accentDark},
  compactIconButton: {width: 40, height: 40},
  playerOverlay: {
    justifyContent: 'space-between',
    padding: spacing.xs,
    backgroundColor: '#00000066',
  },
  playerTopRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  playerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: '#000000',
    textShadowRadius: 4,
  },
  statsText: {
    color: colors.accent,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  playerBottomControls: {
    gap: 2,
    padding: spacing.xs,
    borderRadius: 12,
    backgroundColor: '#080D13D9',
  },
  transportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 1,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  timeText: {
    color: colors.secondaryText,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  sliderContainer: {
    height: 28,
    justifyContent: 'center',
  },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  sliderProgress: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  sliderThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    backgroundColor: colors.text,
  },
  sliderDisabled: {opacity: 0.5},
  playerOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 2,
  },
  volumeText: {
    minWidth: 29,
    color: colors.secondaryText,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  audioTrackLabel: {
    maxWidth: 46,
    color: colors.secondaryText,
    fontSize: 9,
  },
  utilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  loopText: {
    flex: 1,
    color: colors.secondaryText,
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  utilityButton: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: colors.raised,
    paddingHorizontal: spacing.xs,
  },
  utilityText: {color: colors.text, fontSize: 10, fontWeight: '600'},
  bookmarkRow: {gap: spacing.xs},
  speedButton: {
    minWidth: 42,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.raised,
  },
  speedText: {color: colors.text, fontSize: 12, fontWeight: '700'},
  lockHint: {
    alignSelf: 'center',
    marginBottom: spacing.sm,
    color: colors.text,
    fontSize: 12,
    backgroundColor: '#000000AA',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
  },
  fullscreenContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#000000',
  },
  fullscreenControls: {
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  disabledButton: {opacity: 0.45},
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: '#000000AA',
  },
  renameDialog: {gap: spacing.md},
  nameInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    color: colors.text,
    backgroundColor: colors.background,
  },
  characterCount: {
    alignSelf: 'flex-end',
    color: colors.muted,
    fontSize: 12,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  dialogButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.raised,
    paddingHorizontal: spacing.md,
  },
  dialogButtonText: {color: colors.text, fontWeight: '600'},
  saveButton: {backgroundColor: colors.accent},
  saveButtonText: {color: colors.background, fontWeight: '700'},
});
