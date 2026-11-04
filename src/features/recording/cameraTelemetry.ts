export interface CameraTelemetrySample {
  timestampMs: number;
  headingDegrees: number | null;
  speedKph: number | null;
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

export function formatSpeed(speedKph: number | null): string {
  if (
    speedKph === null ||
    !Number.isFinite(speedKph) ||
    speedKph < 0 ||
    speedKph > 198
  ) {
    return '--';
  }
  return String(Math.round(speedKph));
}
