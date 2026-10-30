import {create} from 'zustand';

import type {TripPoint} from '../../data/models';

interface TripTrackingState {
  isTracking: boolean;
  tripId: string | null;
  currentPoint: TripPoint | null;
  error: string | null;
  start: (tripId: string) => void;
  setPoint: (point: TripPoint) => void;
  setError: (message: string) => void;
  clearError: () => void;
  stop: () => void;
}

export const useTripStore = create<TripTrackingState>(set => ({
  isTracking: false,
  tripId: null,
  currentPoint: null,
  error: null,
  start: tripId =>
    set({isTracking: true, tripId, currentPoint: null, error: null}),
  setPoint: currentPoint => set({currentPoint, error: null}),
  setError: error => set({error}),
  clearError: () => set({error: null}),
  stop: () => set({isTracking: false, tripId: null, currentPoint: null}),
}));
