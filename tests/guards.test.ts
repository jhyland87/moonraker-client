import { describe, expect, it } from 'vitest';

import {
  isJsonRpcErrorResponse,
  isJsonRpcMessage,
  isJsonRpcNotification,
  isJsonRpcResponse,
  isStatusUpdateParams,
} from '../src/guards';
import type {
  JsonRpcErrorResponse,
  JsonRpcSuccessResponse,
} from '../src/types';

describe('isJsonRpcMessage', () => {
  it('accepts objects with jsonrpc:"2.0"', () => {
    expect(isJsonRpcMessage({ jsonrpc: '2.0', id: 1, result: null })).toBe(true);
    expect(isJsonRpcMessage({ jsonrpc: '2.0', method: 'foo' })).toBe(true);
  });

  it('rejects null, undefined, primitives, and arrays', () => {
    expect(isJsonRpcMessage(null)).toBe(false);
    expect(isJsonRpcMessage(undefined)).toBe(false);
    expect(isJsonRpcMessage('hello')).toBe(false);
    expect(isJsonRpcMessage(42)).toBe(false);
    expect(isJsonRpcMessage(true)).toBe(false);
    expect(isJsonRpcMessage([])).toBe(false);
  });

  it('rejects objects missing the jsonrpc field', () => {
    expect(isJsonRpcMessage({ id: 1, result: null })).toBe(false);
  });

  it('rejects objects with a wrong jsonrpc version', () => {
    expect(isJsonRpcMessage({ jsonrpc: '1.0', id: 1 })).toBe(false);
    expect(isJsonRpcMessage({ jsonrpc: 2.0, id: 1 })).toBe(false); // number, not string
  });
});

describe('isJsonRpcResponse', () => {
  it('accepts messages with a numeric id', () => {
    expect(isJsonRpcResponse({ jsonrpc: '2.0', id: 1, result: 'ok' })).toBe(true);
    expect(isJsonRpcResponse({ jsonrpc: '2.0', id: 0, result: null })).toBe(true);
  });

  it('rejects notifications (no id field)', () => {
    expect(
      isJsonRpcResponse({ jsonrpc: '2.0', method: 'foo' } as unknown as JsonRpcSuccessResponse),
    ).toBe(false);
  });

  it('rejects messages with a non-numeric id', () => {
    expect(
      isJsonRpcResponse({ jsonrpc: '2.0', id: 'abc', result: null } as unknown as JsonRpcSuccessResponse),
    ).toBe(false);
  });
});

describe('isJsonRpcNotification', () => {
  it('accepts messages with a string method', () => {
    expect(isJsonRpcNotification({ jsonrpc: '2.0', method: 'notify_status_update' })).toBe(true);
  });

  it('rejects responses (no method)', () => {
    expect(
      isJsonRpcNotification({ jsonrpc: '2.0', id: 1, result: 'ok' } as unknown as JsonRpcSuccessResponse),
    ).toBe(false);
  });

  it('rejects messages with a non-string method', () => {
    expect(
      isJsonRpcNotification({ jsonrpc: '2.0', method: 42 } as unknown as JsonRpcSuccessResponse),
    ).toBe(false);
  });
});

describe('isJsonRpcErrorResponse', () => {
  it('discriminates the error variant from a success response', () => {
    const success: JsonRpcSuccessResponse = { jsonrpc: '2.0', id: 1, result: 'ok' };
    const error: JsonRpcErrorResponse = {
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32601, message: 'Method not found' },
    };
    expect(isJsonRpcErrorResponse(success)).toBe(false);
    expect(isJsonRpcErrorResponse(error)).toBe(true);
  });
});

describe('isStatusUpdateParams', () => {
  it('accepts a 2-tuple of [status, eventtime]', () => {
    expect(isStatusUpdateParams([{ extruder: { temperature: 200 } }, 12.34])).toBe(true);
  });

  it('accepts longer arrays as long as the first two slots are correctly typed', () => {
    // Moonraker only sends 2-tuples, but the guard shouldn't be strict about length.
    expect(isStatusUpdateParams([{ extruder: {} }, 1, 'extra'])).toBe(true);
  });

  it('rejects non-array params', () => {
    expect(isStatusUpdateParams({ status: {}, eventtime: 1 })).toBe(false);
    expect(isStatusUpdateParams(null)).toBe(false);
    expect(isStatusUpdateParams(undefined)).toBe(false);
    expect(isStatusUpdateParams('notify')).toBe(false);
  });

  it('rejects arrays shorter than 2 elements', () => {
    expect(isStatusUpdateParams([{}])).toBe(false);
    expect(isStatusUpdateParams([])).toBe(false);
  });

  it('rejects wrong types in the tuple slots', () => {
    expect(isStatusUpdateParams([{}, '12'])).toBe(false); // eventtime must be number
    expect(isStatusUpdateParams([null, 12])).toBe(false); // status must be object
    expect(isStatusUpdateParams(['string', 12])).toBe(false);
  });
});
