import React from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {useNavigation} from '@react-navigation/native';

import {Card, Screen} from '../components/Screen';
import {ActionButton, Label, Metric, StatusBadge} from '../components/UI';
import {listRecordings} from '../data/database';
import {useRecordingStore} from '../features/recording/recordingStore';
import {useSettingsStore} from '../features/recording/settingsStore';
import {useTripStore} from '../features/trips/tripStore';
import {formatBytes} from '../features/storage/formatBytes';
import type {AppTabNavigationProp} from '../navigation/types';
import {colors, spacing} from '../app/theme';
import * as RNFS from 'react-native-fs';

export function DashboardScreen() {
  const navigation = useNavigation<AppTabNavigationProp>();
  const recordingStatus = useRecordingStore(state => state.status);
  const cameraPosition = useSettingsStore(state => state.cameraPosition);
  const isTrackingTrip = useTripStore(state => state.isTracking);
  const elapsedSeconds = useRecordingStore(state => state.elapsedSeconds);
  const clipsQuery = useQuery({
    queryKey: ['recordings'],
    queryFn: listRecordings,
  });
  const storageQuery = useQuery({
    queryKey: ['storage'],
    queryFn: RNFS.getFSInfo,
    staleTime: 30_000,
  });
  const recentClips = clipsQuery.data?.slice(0, 3) ?? [];
  const freeSpace = storageQuery.data?.freeSpace;

  return (
    <Screen title="MileVDO Meru" subtitle="Your drive, recorded with care.">
      <Card style={styles.statusCard}>
        <View style={styles.statusHeading}>
          <Text style={styles.cardTitle}>Recording status</Text>
          <StatusBadge
            label={recordingStatus === 'recording' ? 'RECORDING' : 'STANDBY'}
            tone={recordingStatus === 'recording' ? 'danger' : 'neutral'}
          />
        </View>
        <View style={styles.metrics}>
          <Metric
            label="Active camera"
            value={cameraPosition === 'back' ? 'Rear' : 'Front'}
            detail="Single camera"
          />
          <Metric
            label="Elapsed"
            value={
              recordingStatus === 'recording'
                ? formatDuration(elapsedSeconds)
                : '--:--'
            }
            detail="Segment duration varies"
          />
        </View>
        <View style={styles.metrics}>
          <Metric
            label="Available storage"
            value={freeSpace === undefined ? '—' : formatBytes(freeSpace)}
            detail={
              storageQuery.isError
                ? 'Storage check unavailable'
                : 'App device storage'
            }
          />
          <Metric
            label="GPS"
            value={isTrackingTrip ? 'Tracking' : 'Off'}
            detail={
              isTrackingTrip
                ? 'Foreground trip tracking'
                : 'Enable only when needed'
            }
          />
        </View>
        {recordingStatus === 'error' ? (
          <Label color={colors.danger}>
            Recording stopped. Open Record for the error details.
          </Label>
        ) : null}
      </Card>

      <ActionButton
        label={
          recordingStatus === 'recording'
            ? 'Open recording controls'
            : 'Start a recording'
        }
        onPress={() => navigation.navigate('Record')}
      />

      <View style={styles.sectionHeader}>
        <Text style={styles.cardTitle}>Recent clips</Text>
        <Text
          style={styles.sectionLink}
          onPress={() => navigation.navigate('Videos')}>
          View all
        </Text>
      </View>
      {clipsQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : clipsQuery.isError ? (
        <Card>
          <Label color={colors.danger}>
            Could not load clips: {clipsQuery.error.message}
          </Label>
        </Card>
      ) : recentClips.length === 0 ? (
        <Card>
          <Text style={styles.cardTitle}>No clips yet</Text>
          <Label>Your finalized recordings will appear here.</Label>
        </Card>
      ) : (
        recentClips.map(clip => (
          <Card key={clip.id}>
            <Text style={styles.cardTitle}>
              {formatClipDate(clip.startTime)}
            </Text>
            <Label>
              {clip.width} × {clip.height} ·{' '}
              {formatDuration(clip.durationSeconds)}
              {clip.protected ? ' · Protected' : ''}
            </Label>
          </Card>
        ))
      )}
      <Label>
        {Platform.OS === 'android'
          ? 'Android recording uses a camera/microphone foreground service while the session is active. Screen-lock capture depends on device and Android camera availability; front/rear capture is limited to supported devices.'
          : 'iOS recording ends when the app is backgrounded; this capture implementation records from one camera at a time.'}
      </Label>
    </Screen>
  );
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(
    2,
    '0',
  )}`;
}

function formatClipDate(isoDate: string): string {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? 'Recorded clip' : date.toLocaleString();
}

const styles = StyleSheet.create({
  statusCard: {gap: spacing.lg},
  statusHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metrics: {flexDirection: 'row', gap: spacing.md},
  cardTitle: {color: colors.text, fontSize: 16, fontWeight: '700'},
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionLink: {color: colors.accent, fontSize: 13, fontWeight: '700'},
});
