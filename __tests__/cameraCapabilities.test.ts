import {supportsConcurrentFrontRear} from '../src/features/recording/cameraCapabilities';

describe('supportsConcurrentFrontRear', () => {
  it('requires both front and rear camera ids in a reported concurrent set', () => {
    expect(supportsConcurrentFrontRear([['0', '1']], '1', '0')).toBe(true);
    expect(supportsConcurrentFrontRear([['0', '2']], '1', '0')).toBe(false);
  });

  it('does not claim support without both discovered camera ids', () => {
    expect(supportsConcurrentFrontRear([['0', '1']], undefined, '0')).toBe(false);
    expect(supportsConcurrentFrontRear([], '1', '0')).toBe(false);
  });
});
