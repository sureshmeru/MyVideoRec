import React from 'react';
import {Platform} from 'react-native';

import {Card, Screen} from '../components/Screen';
import {Label, Row, StatusBadge} from '../components/UI';

export function DiagnosticsScreen() {
  return (
    <Screen title="Diagnostics" subtitle="Support describes this build; it does not certify a specific phone.">
      <Card>
        <StatusBadge label="DEVICE TEST NOT YET RECORDED" tone="warning" />
        <Row title="Platform" value={Platform.OS === 'ios' ? 'iOS' : 'Android'} />
        <Row title="Camera mode" value="One selected camera, discovered at runtime" />
        <Row title="Resolution / frame rate" value="Selected from runtime camera formats" />
        <Row title="Front + rear simultaneously" value="Not implemented" />
        <Row title="Recording while locked" value="Not supported by this build" />
        <Row title="Location / trip tracking" value="Off and not implemented" />
        <Row title="Cloud providers" value="Not connected or implemented" />
      </Card>
      <Card>
        <Label>
          Test on the intended physical device before relying on any recording. Camera formats,
          thermal limits, low-storage behavior, and lifecycle interruptions are device-dependent.
        </Label>
      </Card>
    </Screen>
  );
}
