jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

import {useSettingsStore} from '../src/features/recording/settingsStore';

describe('persisted video recording settings', () => {
  it('includes resolution, quality, FPS, codec, and bitrate in persisted state', () => {
    const settings = useSettingsStore.getState();
    settings.setVideoResolution('2160p');
    settings.setVideoQuality('high');
    settings.setFrameRate(60);
    settings.setVideoCodec('h265');
    settings.setCustomBitrateMbps(48);

    const partialize = useSettingsStore.persist.getOptions().partialize;
    expect(partialize?.(useSettingsStore.getState())).toMatchObject({
      videoResolution: '2160p',
      videoQuality: 'high',
      frameRate: 60,
      videoCodec: 'h265',
      customBitrateMbps: 48,
    });
  });
});
