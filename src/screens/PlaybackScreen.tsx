import React, {useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import Video from 'react-native-video';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {colors, spacing} from '../app/theme';
import {Card, Screen} from '../components/Screen';
import {ActionButton, Label} from '../components/UI';
import {listRecordings} from '../data/database';
import type {RootStackParamList} from '../navigation/types';
import {shareRecording} from '../features/storage/shareRecording';

type Props = NativeStackScreenProps<RootStackParamList, 'VideoPlayback'>;

export function PlaybackScreen({route}: Props) {
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const recordingsQuery = useQuery({queryKey: ['recordings'], queryFn: listRecordings});
  const recording = recordingsQuery.data?.find(item => item.id === route.params.recordingId);
  const shareClip = () => {
    if (!recording) {
      return;
    }
    shareRecording(recording).catch(error => {
      setPlaybackError(error instanceof Error ? error.message : 'The clip could not be shared.');
    });
  };

  return (
    <Screen title="Clip playback">
      {recordingsQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : recordingsQuery.isError ? (
        <Card>
          <Label color={colors.danger}>Unable to load recording: {recordingsQuery.error.message}</Label>
        </Card>
      ) : recording ? (
        <>
          <View style={styles.videoFrame}>
            <Video
              source={{uri: recording.localUri}}
              style={StyleSheet.absoluteFill}
              controls
              resizeMode="contain"
              onError={error => setPlaybackError(error.error.errorString ?? 'The video could not be played.')}
            />
          </View>
          {playbackError ? (
            <Card>
              <Label color={colors.danger}>{playbackError}</Label>
            </Card>
          ) : null}
          <Card>
            <Text style={styles.title}>{recording.displayName}</Text>
            <Label>
              {recording.cameraPosition === 'back' ? 'Rear' : 'Front'} camera · {recording.width} × {recording.height}
            </Label>
            <Label>{recording.durationSeconds.toFixed(0)} seconds · Protected: {recording.protected ? 'Yes' : 'No'}</Label>
            <ActionButton label="Share / export clip" variant="secondary" onPress={shareClip} />
          </Card>
        </>
      ) : (
        <Card>
          <Label color={colors.warning}>This clip is not in the local library. It may have been removed.</Label>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  videoFrame: {
    height: 260,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#000000',
  },
  title: {color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.xs},
});
