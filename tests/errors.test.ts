import { describe, expect, it } from 'vitest';

import { MoonrakerError } from '../src/errors';

describe('MoonrakerError', () => {
  it('exposes message, code, and optional data', () => {
    const err = new MoonrakerError('boom', -32601, { method: 'foo' });
    expect(err.message).toBe('boom');
    expect(err.code).toBe(-32601);
    expect(err.data).toEqual({ method: 'foo' });
  });

  it('sets the conventional error name', () => {
    const err = new MoonrakerError('boom', 1);
    expect(err.name).toBe('MoonrakerError');
  });

  it('is an instance of both Error and MoonrakerError', () => {
    const err = new MoonrakerError('boom', 1);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(MoonrakerError);
  });

  it('leaves data undefined when omitted', () => {
    const err = new MoonrakerError('boom', 1);
    expect(err.data).toBeUndefined();
  });

  it('preserves the message through Error inheritance', () => {
    const err = new MoonrakerError('detailed message', -1);
    expect(String(err)).toContain('detailed message');
  });
});
