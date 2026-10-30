import {formatBytes} from '../src/features/storage/formatBytes';

describe('formatBytes', () => {
  it('formats available storage and rejects invalid values', () => {
    expect(formatBytes(1024 ** 3)).toBe('1.0 GB');
    expect(formatBytes(256 * 1024 ** 2)).toBe('256 MB');
    expect(formatBytes(Number.NaN)).toBe('Unavailable');
  });
});
