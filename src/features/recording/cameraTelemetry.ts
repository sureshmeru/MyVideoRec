import type {TripPoint} from '../../data/models';
import {estimateSpeedMps} from '../trips/gpsPolicy';

export interface CameraTelemetrySample {
  timestampMs: number;
  headingDegrees: number | null;
  speedKph: number | null;
}

export function resolveCameraSpeedKph(
  providerSpeedMps: number | null,
  accuracyMeters: number,
  previousPoint: TripPoint | null,
  currentPoint: TripPoint,
): number | null {
  if (
    providerSpeedMps !== null &&
    Number.isFinite(providerSpeedMps) &&
    providerSpeedMps >= 0 &&
    providerSpeedMps <= 55
  ) {
    return providerSpeedMps * 3.6;
  }
  if (!Number.isFinite(accuracyMeters) || accuracyMeters > 20) {
    return null;
  }
  const estimatedSpeedMps = estimateSpeedMps(previousPoint, currentPoint);
  return estimatedSpeedMps === null ? null : estimatedSpeedMps * 3.6;
}

export function getTelemetrySampleAt(
  samples: readonly CameraTelemetrySample[],
  timestampMs: number,
): CameraTelemetrySample | null {
  let latest: CameraTelemetrySample | null = null;
  for (const sample of samples) {
    if (sample.timestampMs > timestampMs) {
      break;
    }
    latest = sample;
  }
  return latest;
}

export function formatHeading(headingDegrees: number | null): string {
  if (
    headingDegrees === null ||
    !Number.isFinite(headingDegrees) ||
    headingDegrees < 0 ||
    headingDegrees >= 360
  ) {
    return '—';
  }
  return `${Math.round(headingDegrees)}°`;
}

export function formatSpeed(
  speedKph: number | null,
  unit: 'kmh' | 'mph' = 'kmh',
): string {
  if (
    speedKph === null ||
    !Number.isFinite(speedKph) ||
    speedKph < 0 ||
    speedKph > 198
  ) {
    return '--';
  }
  const speed = unit === 'mph' ? speedKph / 1.609344 : speedKph;
  return String(Math.round(speed));
}

export function getCardinalDirection(headingDegrees: number | null): string {
  if (
    headingDegrees === null ||
    !Number.isFinite(headingDegrees) ||
    headingDegrees < 0 ||
    headingDegrees >= 360
  ) {
    return '—';
  }
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
    Math.round(headingDegrees / 45) % 8
  ];
}
