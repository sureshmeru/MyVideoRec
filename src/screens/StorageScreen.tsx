import React from 'react';
import {ActivityIndicator, Alert, StyleSheet, Text} from 'react-native';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import * as RNFS from 'react-native-fs';

import {colors, spacing} from '../app/theme';
import {Card, Screen} from '../components/Screen';
import {ActionButton, Label, StatusBadge} from '../components/UI';
import {listRecordings, setRecordingProtected} from '../data/database';
import {formatBytes} from '../features/storage/formatBytes';
import {deleteLocalRecording} from '../features/storage/recordingFileService';
import {useSettingsStore} from '../features/recording/settingsStore';

export function StorageScreen() {
  const queryClient = useQueryClient();
  const spaceQuery = useQuery({queryKey: ['storage'], queryFn: RNFS.getFSInfo});
  const recordingsQuery = useQuery({queryKey: ['recordings'], queryFn: listRecordings});
  const loopCleanupEnabled = useSettingsStore(state => state.loopCleanupEnabled);
  const setLoopCleanupEnabled = useSettingsStore(state => state.setLoopCleanupEnabled);
  const protectMutation = useMutation({
    mutationFn: ({id, protected: isProtected}: {id: string; protected: boolean}) =>
      setRecordingProtected(id, isProtected),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ['recordings']}),
  });

  const deleteClip = async (recording: NonNullable<typeof recordingsQuery.data>[number]) => {
    try {
      await deleteLocalRecording(recording);
      await queryClient.invalidateQueries({queryKey: ['recordings']});
      await queryClient.invalidateQueries({queryKey: ['storage']});
    } catch (error) {
      Alert.alert(
        'Could not delete clip',
        error instanceof Error ? error.message : 'An unexpected storage error occurred.',
      );
    }
  };

  return (
    <Screen title="Storage" subtitle="Protected clips are never eligible for automatic cleanup.">
      <Card>
        <Text style={styles.title}>Device storage</Text>
        {spaceQuery.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : spaceQuery.isError ? (
          <Label color={colors.danger}>Storage check failed: {spaceQuery.error.message}</Label>
        ) : (
          <>
            <Label>{formatBytes(spaceQuery.data?.freeSpace ?? 0)} available to the app</Label>
            <Label>{formatBytes(spaceQuery.data?.totalSpace ?? 0)} total device storage</Label>
          </>
        )}
        <ActionButton
          label={loopCleanupEnabled ? 'Disable automatic cleanup' : 'Enable automatic cleanup'}
          variant={loopCleanupEnabled ? 'primary' : 'secondary'}
          onPress={() => setLoopCleanupEnabled(!loopCleanupEnabled)}
        />
        <Label>
          When enabled and free space falls below 512 MB, the oldest unprotected clips are removed
          until approximately 1 GB is free. Clips queued or actively transferring are skipped.
        </Label>
      </Card>
      {recordingsQuery.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : recordingsQuery.isError ? (
        <Card>
          <Label color={colors.danger}>Could not load clips: {recordingsQuery.error.message}</Label>
        </Card>
      ) : recordingsQuery.data?.map(recording => (
        <Card key={recording.id} style={styles.clip}>
          <Text style={styles.title}>{recording.displayName}</Text>
          <StatusBadge label={recording.protected ? 'PROTECTED' : 'UNPROTECTED'} tone={recording.protected ? 'warning' : 'neutral'} />
          <Label>{formatBytes(recording.fileSizeBytes)} · {recording.uploadStatus}</Label>
          <ActionButton
            label={recording.protected ? 'Unlock clip' : 'Protect clip'}
            variant="secondary"
            onPress={() => protectMutation.mutate({id: recording.id, protected: !recording.protected})}
            disabled={protectMutation.isPending}
          />
          <ActionButton
            label="Delete clip"
            variant="danger"
            onPress={() =>
              Alert.alert('Delete this clip?', 'This permanently removes the local video.', [
                {text: 'Cancel', style: 'cancel'},
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => deleteClip(recording),
                },
              ])
            }
            disabled={recording.protected}
          />
        </Card>
      ))}
      {protectMutation.isError ? (
        <Label color={colors.danger}>{protectMutation.error.message}</Label>
      ) : null}
      <Label>
        Loop cleanup is not enabled. The app will stop before starting a segment if available storage
        is below its safety reserve; it will not silently delete footage.
      </Label>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {color: colors.text, fontSize: 16, fontWeight: '700'},
  clip: {gap: spacing.sm},
});
