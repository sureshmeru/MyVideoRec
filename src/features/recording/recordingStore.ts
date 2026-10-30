import {create} from 'zustand';

export type RecordingStatus = 'idle' | 'recording' | 'finalizing' | 'error';

interface RecordingState {
  status: RecordingStatus;
  startedAt: number | null;
  elapsedSeconds: number;
  error: string | null;
  setStatus: (status: RecordingStatus) => void;
  setError: (message: string) => void;
  setElapsedSeconds: (seconds: number) => void;
  reset: () => void;
}

const initialState = {
  status: 'idle' as RecordingStatus,
  startedAt: null as number | null,
  elapsedSeconds: 0,
  error: null as string | null,
};

export const useRecordingStore = create<RecordingState>(set => ({
  ...initialState,
  setStatus: status =>
    set(state => ({
      status,
      startedAt: status === 'recording' ? state.startedAt ?? Date.now() : null,
      error: status === 'error' ? state.error : null,
    })),
  setError: message => set({status: 'error', error: message, startedAt: null}),
  setElapsedSeconds: elapsedSeconds => set({elapsedSeconds}),
  reset: () => set(initialState),
}));
