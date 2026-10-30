import React from 'react';
import {StyleSheet, Text} from 'react-native';

import {colors, spacing} from '../app/theme';
import {Card, Screen} from '../components/Screen';
import {Label, StatusBadge} from '../components/UI';

const providers = ['Google Drive', 'Microsoft OneDrive', 'Dropbox', 'USB / Files'];

export function CloudProvidersScreen() {
  return (
    <Screen title="Backups" subtitle="Local recording does not depend on an internet connection.">
      <Card>
        <StatusBadge label="NO PROVIDERS CONNECTED" />
        <Label>
          Cloud sign-in and transfer adapters have not been configured. No credentials are stored
          and no uploads are running.
        </Label>
      </Card>
      {providers.map(provider => (
        <Card key={provider} style={styles.provider}>
          <Text style={styles.title}>{provider}</Text>
          <Label>Not connected</Label>
        </Card>
      ))}
      <Label>
        A transfer must be verified before an original local clip can be considered for deletion.
      </Label>
    </Screen>
  );
}

const styles = StyleSheet.create({
  provider: {gap: spacing.xs},
  title: {color: colors.text, fontSize: 15, fontWeight: '700'},
});
