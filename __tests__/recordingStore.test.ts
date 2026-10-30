import {useRecordingStore} from '../src/features/recording/recordingStore';

describe('recording state', () => {
  beforeEach(() => useRecordingStore.getState().reset());

  it('moves through recording and finalization without retaining a stale start time', () => {
    useRecordingStore.getState().setStatus('recording');
    expect(useRecordingStore.getState().status).toBe('recording');
    expect(useRecordingStore.getState().startedAt).not.toBeNull();

    useRecordingStore.getState().setStatus('finalizing');
    expect(useRecordingStore.getState().status).toBe('finalizing');
    expect(useRecordingStore.getState().startedAt).toBeNull();
  });

  it('retains the failure message until a new recording starts', () => {
    useRecordingStore.getState().setError('Camera disconnected');
    expect(useRecordingStore.getState().error).toBe('Camera disconnected');

    useRecordingStore.getState().setStatus('recording');
    expect(useRecordingStore.getState().error).toBeNull();
  });
});
