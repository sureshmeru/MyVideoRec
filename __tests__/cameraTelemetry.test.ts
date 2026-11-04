import {
  formatHeading,
  formatSpeed,
  getTelemetrySampleAt,
} from '../src/features/recording/cameraTelemetry';

describe('camera telemetry formatting', () => {
  it('formats valid headings and leaves unavailable headings blank', () => {
    expect(formatHeading(12.6)).toBe('13°');
    expect(formatHeading(null)).toBe('—');
    expect(formatHeading(360)).toBe('—');
  });

  it('formats GPS speed in whole KMPH and rejects invalid values', () => {
    expect(formatSpeed(42.4)).toBe('42');
    expect(formatSpeed(null)).toBe('--');
    expect(formatSpeed(250)).toBe('--');
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
