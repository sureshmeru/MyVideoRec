import {
  formatHeading,
  formatSpeed,
  getCardinalDirection,
  getTelemetrySampleAt,
  resolveCameraSpeedKph,
} from '../src/features/recording/cameraTelemetry';

describe('camera telemetry formatting', () => {
  it('formats valid headings and leaves unavailable headings blank', () => {
    expect(formatHeading(12.6)).toBe('13°');
    expect(formatHeading(null)).toBe('—');
    expect(formatHeading(360)).toBe('—');
    expect(getCardinalDirection(0)).toBe('N');
    expect(getCardinalDirection(90)).toBe('E');
    expect(getCardinalDirection(null)).toBe('—');
  });

  it('formats GPS speed in whole KMPH and rejects invalid values', () => {
    expect(formatSpeed(42.4)).toBe('42');
    expect(formatSpeed(100, 'mph')).toBe('62');
    expect(formatSpeed(null)).toBe('--');
    expect(formatSpeed(250)).toBe('--');
  });

  it('uses GPS speed even when horizontal location accuracy is coarse', () => {
    const point = {
      tripId: 'camera',
      recordedAt: new Date(2000).toISOString(),
      latitude: 0,
      longitude: 0,
      speedMps: null,
      accuracyMeters: 80,
    };

    expect(resolveCameraSpeedKph(12, 80, null, point)).toBeCloseTo(43.2);
    expect(resolveCameraSpeedKph(null, 80, null, point)).toBeNull();
  });

  it('estimates speed across accurate GPS fixes when provider speed is absent', () => {
    const previousPoint = {
      tripId: 'camera',
      recordedAt: new Date(1000).toISOString(),
      latitude: 0,
      longitude: 0,
      speedMps: null,
      accuracyMeters: 3,
    };
    const currentPoint = {
      ...previousPoint,
      recordedAt: new Date(11_000).toISOString(),
      latitude: 0.001,
    };

    expect(
      resolveCameraSpeedKph(null, 3, previousPoint, currentPoint),
    ).toBeCloseTo(40, 0);
  });

  it('uses the latest telemetry sample at or before a video frame time', () => {
    const samples = [
      {timestampMs: 1000, headingDegrees: 10, speedKph: 20},
      {timestampMs: 2000, headingDegrees: 15, speedKph: 30},
    ];

    expect(getTelemetrySampleAt(samples, 999)).toBeNull();
    expect(getTelemetrySampleAt(samples, 1000)).toEqual(samples[0]);
    expect(getTelemetrySampleAt(samples, 2500)).toEqual(samples[1]);
  });
});
