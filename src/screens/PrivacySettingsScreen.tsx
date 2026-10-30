import React from 'react';

import {Card, Screen} from '../components/Screen';
import {Label, Row} from '../components/UI';
import {useSettingsStore} from '../features/recording/settingsStore';
import {useTripStore} from '../features/trips/tripStore';

export function PrivacySettingsScreen() {
  const audioEnabled = useSettingsStore(state => state.audioEnabled);
  const isTracking = useTripStore(state => state.isTracking);
  return (
    <Screen title="Privacy & permissions" subtitle="The app asks for sensitive access only when the related feature is used.">
      <Card>
        <Row title="Camera" value="Required for video capture" />
        <Row title="Microphone" value={audioEnabled ? 'Optional audio enabled' : 'Off'} />
        <Row title="Location" value={isTracking ? 'In use for an active foreground trip' : 'Off unless you start a trip'} />
        <Row title="Network" value="Used only for explicitly configured backups" />
      </Card>
      <Card>
        <Label>
          iOS may suspend camera capture when this app is backgrounded or the phone locks. Android
          continuous camera capture also depends on the foreground-service implementation, OS
          version, and device. This build stops recording when it leaves the foreground.
        </Label>
      </Card>
    </Screen>
  );
}
