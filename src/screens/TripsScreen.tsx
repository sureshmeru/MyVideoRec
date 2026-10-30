import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, AppStateStatus, StyleSheet, Text} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import type {GeolocationResponse} from '@react-native-community/geolocation';
import {useQuery, useQueryClient} from '@tanstack/react-query';

import {colors, spacing} from '../app/theme';
import {Card, Screen} from '../components/Screen';
import {ActionButton, Label, StatusBadge} from '../components/UI';
import {createTrip, finishTrip, listTrips, saveTripPoint} from '../data/database';
import type {TripPoint} from '../data/models';
import {distanceBetweenReliablePoints, estimateSpeedMps} from '../features/trips/gpsPolicy';
import {requestForegroundLocationPermission} from '../features/trips/locationPermissions';
import {useTripStore} from '../features/trips/tripStore';

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  distanceFilter: 10,
  interval: 10_000,
  fastestInterval: 5_000,
  maximumAge: 0,
  timeout: 20_000,
};

export function TripsScreen() {
  const watchIdRef = useRef<number | null>(null);
  const startingRef = useRef(false);
  const [isStarting, setIsStarting] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const queryClient = useQueryClient();
  const tracking = useTripStore(state => state.isTracking);
  const currentPoint = useTripStore(state => state.currentPoint);
  const error = useTripStore(state => state.error);
  const startTracking = useTripStore(state => state.start);
  const setPoint = useTripStore(state => state.setPoint);
  const setError = useTripStore(state => state.setError);
  const clearError = useTripStore(state => state.clearError);
  const stopStore = useTripStore(state => state.stop);
  const tripsQuery = useQuery({queryKey: ['trips'], queryFn: listTrips});

  const stopTrip = useCallback(
    async (reason?: string) => {
      if (watchIdRef.current !== null) {
        Geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      const activeTripId = useTripStore.getState().tripId;
      stopStore();
      if (activeTripId) {
        try {
          await finishTrip(activeTripId, new Date().toISOString());
          await queryClient.invalidateQueries({queryKey: ['trips']});
        } catch (stopError) {
          const message =
            stopError instanceof Error ? stopError.message : 'Trip data could not be finalized.';
          setError(message);
        }
      }
      if (reason) {
        setError(reason);
      }
    },
    [queryClient, setError, stopStore],
  );

  const onLocation = useCallback(
    (position: GeolocationResponse, id: string) => {
      const previous = useTripStore.getState().currentPoint;
      const currentTrackingState = useTripStore.getState();
      if (!currentTrackingState.isTracking || currentTrackingState.tripId !== id) {
        return;
      }
      const accuracyMeters = position.coords.accuracy;
      if (!Number.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 100) {
        return;
      }
      if (
        !Number.isFinite(position.coords.latitude) ||
        position.coords.latitude < -90 ||
        position.coords.latitude > 90 ||
        !Number.isFinite(position.coords.longitude) ||
        position.coords.longitude < -180 ||
        position.coords.longitude > 180 ||
        !Number.isFinite(position.timestamp)
      ) {
        return;
      }
      const timestamp = new Date(position.timestamp).toISOString();
      const provisionalPoint: TripPoint = {
        tripId: id,
        recordedAt: timestamp,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        speedMps: null,
        accuracyMeters,
      };
      const providerSpeed = position.coords.speed;
      const speedMps =
        providerSpeed !== null &&
        Number.isFinite(providerSpeed) &&
        providerSpeed >= 0 &&
        providerSpeed <= 55 &&
        accuracyMeters <= 30
          ? providerSpeed
          : estimateSpeedMps(previous, provisionalPoint);
      const point = {...provisionalPoint, speedMps};
      const distance = distanceBetweenReliablePoints(previous, point) ?? 0;
      setPoint(point);
      saveTripPoint(point, distance)
        .then(() => queryClient.invalidateQueries({queryKey: ['trips']}))
        .catch(saveError => {
          const message =
            saveError instanceof Error ? saveError.message : 'Trip location could not be saved.';
          setError(message);
          stopTrip(message);
        });
    },
    [queryClient, setError, setPoint, stopTrip],
  );

  const startTrip = async () => {
    if (startingRef.current || useTripStore.getState().isTracking) {
      return;
    }
    startingRef.current = true;
    setIsStarting(true);
    clearError();
    let createdTripId: string | null = null;
    try {
      const permitted = await requestForegroundLocationPermission();
      if (!permitted) {
        setError('Location permission was not granted. Enable it in system settings to track a trip.');
        return;
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await createTrip(id, new Date().toISOString());
      createdTripId = id;
      startTracking(id);
      watchIdRef.current = Geolocation.watchPosition(
        position => onLocation(position, id),
        locationError => {
          stopTrip(`Location tracking stopped: ${locationError.message}`).catch(stopError => {
            const message = stopError instanceof Error ? stopError.message : 'Trip could not be finalized.';
            setError(message);
          });
        },
        LOCATION_OPTIONS,
      );
    } catch (startError) {
      if (createdTripId) {
        stopStore();
        try {
          await finishTrip(createdTripId, new Date().toISOString());
        } catch (finishError) {
          console.error('Failed to close trip after location startup failed.', finishError);
        }
      }
      const message =
        startError instanceof Error ? startError.message : 'Could not start location tracking.';
      setError(message);
    } finally {
      startingRef.current = false;
      setIsStarting(false);
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = nextState;
      if (wasActive && nextState !== 'active' && useTripStore.getState().isTracking) {
        stopTrip('Trip tracking stopped when the app left the foreground.').catch(stopError => {
          const message = stopError instanceof Error ? stopError.message : 'Trip could not be finalized.';
          setError(message);
        });
      }
    });
    return () => subscription.remove();
  }, [setError, stopTrip]);

  useEffect(
    () => () => {
      if (watchIdRef.current !== null) {
        Geolocation.clearWatch(watchIdRef.current);
        const activeTripId = useTripStore.getState().tripId;
        if (activeTripId) {
          finishTrip(activeTripId, new Date().toISOString()).catch(finishError => {
            console.error('Failed to finalize trip while leaving the trip screen.', finishError);
          });
        }
        stopStore();
      }
    },
    [stopStore],
  );

  return (
    <Screen title="Trips" subtitle="Location is optional and only tracked while the app stays in the foreground.">
      <Card>
        <StatusBadge label={tracking ? 'TRIP TRACKING' : 'LOCATION OFF'} tone={tracking ? 'good' : 'neutral'} />
        {tracking ? (
          <>
            <Label>
              {currentPoint
                ? `${currentPoint.latitude.toFixed(5)}, ${currentPoint.longitude.toFixed(5)} · ±${Math.round(currentPoint.accuracyMeters)} m`
                : 'Waiting for an accurate GPS fix…'}
            </Label>
            <Label>
              {currentPoint?.speedMps == null
                ? 'Speed unavailable'
                : `${(currentPoint.speedMps * 3.6).toFixed(0)} km/h GPS estimate`}
            </Label>
            <ActionButton label="End trip" variant="danger" onPress={() => stopTrip()} />
          </>
        ) : (
          <ActionButton
            label={isStarting ? 'Starting trip…' : 'Start trip tracking'}
            onPress={() => startTrip()}
            disabled={isStarting}
          />
        )}
        {error ? <Label color={colors.danger}>{error}</Label> : null}
      </Card>
      <Card>
        <Label>
          GPS speed is an estimate, shown only when the fix appears reliable. It is not a certified
          vehicle speedometer. Location is not recorded unless you start a trip.
        </Label>
      </Card>
      <Text style={styles.sectionTitle}>Trip history</Text>
      {tripsQuery.isLoading ? (
        <Label>Loading trips…</Label>
      ) : tripsQuery.isError ? (
        <Label color={colors.danger}>Trip history failed to load: {tripsQuery.error.message}</Label>
      ) : tripsQuery.data?.length ? (
        tripsQuery.data.map(trip => (
          <Card key={trip.id} style={styles.tripCard}>
            <Text style={styles.tripTitle}>{new Date(trip.startedAt).toLocaleString()}</Text>
            <Label>
              {trip.endedAt ? new Date(trip.endedAt).toLocaleString() : 'In progress'}
              {' · '}
              {(trip.distanceMeters / 1000).toFixed(2)} km
            </Label>
          </Card>
        ))
      ) : (
        <Card>
          <Label>No trips recorded.</Label>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {color: colors.text, fontSize: 17, fontWeight: '700', marginTop: spacing.sm},
  tripCard: {gap: spacing.xs},
  tripTitle: {color: colors.text, fontSize: 15, fontWeight: '700'},
});
