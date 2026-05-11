import { describe, expect, it } from 'vitest';

import * as api from '../src/index';

describe('public exports', () => {
  it('exposes the documented surface', () => {
    expect(api).toMatchObject({
      MoonrakerClient: expect.any(Function),
      MoonrakerError: expect.any(Function),
      SocketState: expect.any(Object),
      describeSocketState: expect.any(Function),
      isJsonRpcMessage: expect.any(Function),
      isJsonRpcResponse: expect.any(Function),
      isJsonRpcNotification: expect.any(Function),
      isJsonRpcErrorResponse: expect.any(Function),
      isStatusUpdateParams: expect.any(Function),
    });
  });

  it('exports exactly the expected names', () => {
    expect(Object.keys(api).sort()).toEqual([
      'MoonrakerClient',
      'MoonrakerError',
      'SocketState',
      'describeSocketState',
      'isJsonRpcErrorResponse',
      'isJsonRpcMessage',
      'isJsonRpcNotification',
      'isJsonRpcResponse',
      'isStatusUpdateParams',
    ]);
  });
});
