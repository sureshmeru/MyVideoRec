import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useSettingsStore} from '../features/recording/settingsStore';

import {colors, spacing} from '../app/theme';
import {Card, Screen} from '../components/Screen';
import {ActionButton, Label, Row} from '../components/UI';

const SEGMENT_LENGTHS = [60, 300, 600];

export function CameraSettingsScreen() {
  const cameraPosition = useSettingsStore(state => state.cameraPosition);
  const setCameraPosition = useSettingsStore(state => state.setCameraPosition);
  const audioEnabled = useSettingsStore(state => state.audioEnabled);
  const setAudioEnabled = useSettingsStore(state => state.setAudioEnabled);
  const segmentSeconds = useSettingsStore(state => state.segmentSeconds);
  const setSegmentSeconds = useSettingsStore(state => state.setSegmentSeconds);

  return (
    <Screen title="Camera & recording">
      <Card>
        <Row title="Selected camera" value={cameraPosition === 'back' ? 'Rear camera' : 'Front camera'} />
        <View style={styles.buttonRow}>
          <ActionButton
            label="Use rear"
            variant={cameraPosition === 'back' ? 'primary' : 'secondary'}
            onPress={() => setCameraPosition('back')}
          />
          <ActionButton
            label="Use front"
            variant={cameraPosition === 'front' ? 'primary' : 'secondary'}
            onPress={() => setCameraPosition('front')}
          />
        </View>
        <Label>The selected camera is checked on the recording screen. No dual-camera capture is claimed.</Label>
      </Card>
      <Card>
        <Row title="Microphone audio" value={audioEnabled ? 'On (permission required)' : 'Off'} />
        <ActionButton
          label={audioEnabled ? 'Disable audio' : 'Enable audio'}
          variant="secondary"
          onPress={() => setAudioEnabled(!audioEnabled)}
        />
        <Label>Microphone permission is requested only when you start a recording with audio enabled.</Label>
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
            />
          ))}
        </View>
        <Label>Each segment is finalized locally before it is added to the library.</Label>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttonRow: {flexDirection: 'row', gap: spacing.sm},
  heading: {color: colors.text, fontSize: 16, fontWeight: '700'},
});
