import {create} from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createJSONStorage, persist} from 'zustand/middleware';

import type {CameraPosition} from '../../data/models';
import type {VideoCodec, VideoQuality, VideoResolution} from './videoSettings';

export type SpeedUnit = 'kmh' | 'mph';

interface RecordingSettings {
  cameraPosition: CameraPosition;
  audioEnabled: boolean;
  segmentSeconds: number;
  loopCleanupEnabled: boolean;
  videoResolution: VideoResolution;
  videoQuality: VideoQuality;
  frameRate: number;
  videoCodec: VideoCodec;
  speedUnit: SpeedUnit;
  customBitrateMbps: number | null;
  setCameraPosition: (position: CameraPosition) => void;
  setAudioEnabled: (enabled: boolean) => void;
  setSegmentSeconds: (seconds: number) => void;
  setLoopCleanupEnabled: (enabled: boolean) => void;
  setVideoResolution: (resolution: VideoResolution) => void;
  setVideoQuality: (quality: VideoQuality) => void;
  setFrameRate: (frameRate: number) => void;
  setVideoCodec: (codec: VideoCodec) => void;
  setSpeedUnit: (unit: SpeedUnit) => void;
  setCustomBitrateMbps: (bitrateMbps: number | null) => void;
}

export const useSettingsStore = create<RecordingSettings>()(
  persist(
    set => ({
      cameraPosition: 'back',
      audioEnabled: false,
      segmentSeconds: 300,
      loopCleanupEnabled: false,
      videoResolution: '1080p',
      videoQuality: 'medium',
      frameRate: 30,
      videoCodec: 'h264',
      speedUnit: 'kmh',
      customBitrateMbps: null,
      setCameraPosition: cameraPosition => set({cameraPosition}),
      setAudioEnabled: audioEnabled => set({audioEnabled}),
      setSegmentSeconds: segmentSeconds => set({segmentSeconds}),
      setLoopCleanupEnabled: loopCleanupEnabled => set({loopCleanupEnabled}),
      setVideoResolution: videoResolution => set({videoResolution}),
      setVideoQuality: videoQuality => set({videoQuality}),
      setFrameRate: frameRate => set({frameRate}),
      setVideoCodec: videoCodec => set({videoCodec}),
      setSpeedUnit: speedUnit => set({speedUnit}),
      setCustomBitrateMbps: customBitrateMbps => set({customBitrateMbps}),
    }),
    {
      name: 'roadwatch-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        cameraPosition: state.cameraPosition,
        audioEnabled: state.audioEnabled,
        segmentSeconds: state.segmentSeconds,
        loopCleanupEnabled: state.loopCleanupEnabled,
        videoResolution: state.videoResolution,
        videoQuality: state.videoQuality,
        frameRate: state.frameRate,
        videoCodec: state.videoCodec,
        speedUnit: state.speedUnit,
        customBitrateMbps: state.customBitrateMbps,
      }),
    },
  ),
);

export async function hydrateSettingsStore(): Promise<void> {
  if (!useSettingsStore.persist.hasHydrated()) {
    await useSettingsStore.persist.rehydrate();
  }
  if (!useSettingsStore.persist.hasHydrated()) {
    throw new Error(
      'Camera settings could not be restored from local storage.',
    );
  }
}
