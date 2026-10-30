import type {TripPoint} from '../../data/models';

const EARTH_RADIUS_METERS = 6_371_000;

export function distanceBetweenReliablePoints(
  previous: TripPoint | null,
  current: TripPoint,
): number | null {
  if (!previous || previous.accuracyMeters > 50 || current.accuracyMeters > 50) {
    return null;
  }
  const elapsedSeconds =
    (new Date(current.recordedAt).getTime() - new Date(previous.recordedAt).getTime()) / 1000;
  if (elapsedSeconds <= 0 || elapsedSeconds > 120) {
    return null;
  }
  const distance = haversineDistance(
    previous.latitude,
    previous.longitude,
    current.latitude,
    current.longitude,
  );
  if (distance <= previous.accuracyMeters + current.accuracyMeters) {
    return null;
  }
  return distance <= Math.max(100, elapsedSeconds * 55) ? distance : null;
}

export function estimateSpeedMps(
  previous: TripPoint | null,
  current: TripPoint,
): number | null {
  if (!previous || previous.accuracyMeters > 20 || current.accuracyMeters > 20) {
    return null;
  }
  const elapsedSeconds =
    (new Date(current.recordedAt).getTime() - new Date(previous.recordedAt).getTime()) / 1000;
  if (elapsedSeconds < 1 || elapsedSeconds > 30) {
    return null;
  }
  const distance = haversineDistance(
    previous.latitude,
    previous.longitude,
    current.latitude,
    current.longitude,
  );
  if (distance <= previous.accuracyMeters + current.accuracyMeters) {
    return null;
  }
  const speed = distance / elapsedSeconds;
  return speed <= 55 ? speed : null;
}

function haversineDistance(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitude1)) *
      Math.cos(toRadians(latitude2)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
