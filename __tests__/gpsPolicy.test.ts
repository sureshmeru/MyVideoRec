import type {TripPoint} from '../src/data/models';
import {distanceBetweenReliablePoints, estimateSpeedMps} from '../src/features/trips/gpsPolicy';

function point(
  latitude: number,
  seconds: number,
  accuracyMeters: number,
): TripPoint {
  return {
    tripId: 'trip',
    recordedAt: new Date(seconds * 1000).toISOString(),
    latitude,
    longitude: 0,
    speedMps: null,
    accuracyMeters,
  };
}

describe('GPS reliability policy', () => {
  it('estimates movement only from accurate, time-ordered fixes', () => {
    const previous = point(0, 0, 5);
    const current = point(0.001, 10, 5);

    expect(distanceBetweenReliablePoints(previous, current)).toBeGreaterThan(100);
    expect(estimateSpeedMps(previous, current)).toBeGreaterThan(10);
  });

  it('rejects inaccurate fixes and implausible location jumps', () => {
    const previous = point(0, 0, 80);
    const inaccurate = point(0.001, 10, 5);
    const plausible = point(0, 10, 5);
    const jump = point(1, 10, 5);

    expect(distanceBetweenReliablePoints(previous, inaccurate)).toBeNull();
    expect(estimateSpeedMps(previous, inaccurate)).toBeNull();
    expect(distanceBetweenReliablePoints(plausible, jump)).toBeNull();
    expect(estimateSpeedMps(plausible, jump)).toBeNull();
  });
});
