import React from 'react';
import {useNavigation} from '@react-navigation/native';
import type {AppTabNavigationProp} from '../navigation/types';

import {Card, Screen} from '../components/Screen';
import {Row} from '../components/UI';

export function SettingsScreen() {
  const navigation = useNavigation<AppTabNavigationProp>();

  return (
    <Screen title="Settings" subtitle="Configure the camera, privacy, and local storage.">
      <Card>
        <Row title="Camera & recording" value="Camera, audio, segment length" onPress={() => navigation.navigate('CameraSettings')} />
        <Row title="Storage manager" value="Local clips and available space" onPress={() => navigation.navigate('StorageManager')} />
        <Row title="Cloud backups" value="Provider connections and upload status" onPress={() => navigation.navigate('CloudProviders')} />
        <Row title="Privacy & permissions" value="Location, microphone, and app permissions" onPress={() => navigation.navigate('PrivacySettings')} />
        <Row title="Diagnostics" value="Device capability and lifecycle support" onPress={() => navigation.navigate('Diagnostics')} />
      </Card>
    </Screen>
  );
}
