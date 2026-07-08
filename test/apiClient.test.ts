import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ApiRequestError,
  ApiSessionExpiredError,
  LUNARCHAIN_NETWORK_ERROR_MESSAGE,
  LUNARCHAIN_REQUEST_TIMEOUT_MS,
  createNetworkRequestError,
  fetchWithTimeout,
  getApiErrorMessage,
  unwrapApiEnvelope
} from '../src/features/api/apiClientCore';
import { getUserFacingErrorMessage, isLikelyNetworkErrorMessage } from '../src/features/api/userFacingErrors';

describe('mobile API helpers', () => {
  it('unwraps standard LunarChain response envelopes', () => {
    assert.deepEqual(unwrapApiEnvelope({ data: { routes: [] } }), { routes: [] });
  });

  it('extracts nested API error detail text', () => {
    assert.equal(
      getApiErrorMessage({ detail: { details: 'No route access.' } }, 'fallback'),
      'No route access.'
    );
  });

  it('trims API error messages and ignores blank backend fields', () => {
    assert.equal(
      getApiErrorMessage({ detail: { details: '   ', message: '  Session invalid.  ' } }, 'fallback'),
      'Session invalid.'
    );
    assert.equal(getApiErrorMessage({ details: '   ', message: '  Gateway timeout. ' }, 'fallback'), 'Gateway timeout.');
    assert.equal(getApiErrorMessage({ detail: '  Forbidden route.  ' }, 'fallback'), 'Forbidden route.');
  });

  it('maps native fetch/network failures to safe connection copy', () => {
    assert.equal(isLikelyNetworkErrorMessage('Network request failed'), true);
    assert.equal(isLikelyNetworkErrorMessage('The request timed out.'), true);
    assert.equal(
      getUserFacingErrorMessage(new TypeError('Network request failed'), 'fallback'),
      'Unable to reach LunarChain. Check your connection and try again.'
    );
    assert.equal(getUserFacingErrorMessage('  Hosted API unavailable  ', 'fallback'), 'Hosted API unavailable');
    assert.equal(getUserFacingErrorMessage({}, 'fallback'), 'fallback');
  });

  it('exposes a typed session-expired error for auth failures', () => {
    const error = new ApiSessionExpiredError();

    assert.equal(error.name, 'ApiSessionExpiredError');
    assert.match(error.message, /session expired/i);
  });

  it('exposes status code on request errors', () => {
    const error = new ApiRequestError('Bad gateway', 502);

    assert.equal(error.statusCode, 502);
  });

  it('creates retryable production copy for network failures', () => {
    const error = createNetworkRequestError();

    assert.equal(error.statusCode, 0);
    assert.equal(error.message, LUNARCHAIN_NETWORK_ERROR_MESSAGE);
  });

  it('uses a bounded request timeout for stalled LunarChain calls', async () => {
    assert.equal(LUNARCHAIN_REQUEST_TIMEOUT_MS, 15000);

    const originalFetch = globalThis.fetch;
    let receivedSignal: AbortSignal | null = null;

    globalThis.fetch = (async (_input, init) => {
      receivedSignal = init?.signal ?? null;

      return await new Promise<Response>((_resolve, reject) => {
        receivedSignal?.addEventListener('abort', () => {
          reject(new Error('AbortError'));
        });
      });
    }) as typeof fetch;

    try {
      await assert.rejects(
        () => fetchWithTimeout('https://api.lunarchain.test/stalled', { timeoutMs: 5 }),
        (error) =>
          error instanceof ApiRequestError &&
          error.statusCode === 0 &&
          error.message === LUNARCHAIN_NETWORK_ERROR_MESSAGE
      );
      assert.equal(receivedSignal?.aborted, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
