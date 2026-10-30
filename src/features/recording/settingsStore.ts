import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createJSONStorage, persist} from 'zustand/middleware';

import type {CameraPosition} from '../../data/models';

interface RecordingSettings {
  cameraPosition: CameraPosition;
  audioEnabled: boolean;
  segmentSeconds: number;
  loopCleanupEnabled: boolean;
  setCameraPosition: (position: CameraPosition) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setSegmentSeconds: (seconds: number) => void;
  setLoopCleanupEnabled: (enabled: boolean) => void;
}

export const useSettingsStore = create<RecordingSettings>()(
  persist(
    set => ({
      cameraPosition: 'back',
      audioEnabled: false,
      segmentSeconds: 300,
      loopCleanupEnabled: false,
      setCameraPosition: cameraPosition => set({cameraPosition}),
      setAudioEnabled: audioEnabled => set({audioEnabled}),
      setSegmentSeconds: segmentSeconds => set({segmentSeconds}),
      setLoopCleanupEnabled: loopCleanupEnabled => set({loopCleanupEnabled}),
    }),
    {
      name: 'roadwatch-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        cameraPosition: state.cameraPosition,
        audioEnabled: state.audioEnabled,
        segmentSeconds: state.segmentSeconds,
        loopCleanupEnabled: state.loopCleanupEnabled,
      }),
    },
  ),
);
