import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  ApiRequestError,
  ApiSessionExpiredError,
  LUNARCHAIN_NETWORK_ERROR_MESSAGE,
  LUNARCHAIN_REQUEST_TIMEOUT_MS,
  LUNARCHAIN_SESSION_EXPIRED_MESSAGE,
  createNetworkRequestError,
  fetchWithTimeout,
  getApiErrorMessage,
  getApiSessionExpiredMessage,
  unwrapApiEnvelope
} from '../src/features/api/apiClientCore';
import {
  LUNARCHAIN_RATE_LIMIT_ERROR,
  LUNARCHAIN_SERVER_ERROR,
  getUserFacingErrorMessage,
  isLikelyNetworkErrorMessage,
  isUnsafeDiagnosticMessage
} from '../src/features/api/userFacingErrors';

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

  it('extracts validation and alternate backend API error shapes', () => {
    assert.equal(
      getApiErrorMessage(
        {
          detail: [
            {
              loc: ['query', 'client_id'],
              msg: 'Input should be a valid string',
              type: 'string_type'
            }
          ]
        },
        'fallback'
      ),
      'Input should be a valid string'
    );
    assert.equal(
      getApiErrorMessage(
        {
          detail: [{ message: '   ' }, { details: 'Route filter is unavailable.' }]
        },
        'fallback'
      ),
      'Route filter is unavailable.'
    );
    assert.equal(getApiErrorMessage({ error: { message: '  Route sync paused.  ' } }, 'fallback'), 'Route sync paused.');
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

  it('uses session recovery copy for protected API auth failures', () => {
    const apiClientSource = readFileSync(
      join(process.cwd(), 'src/features/api/apiClient.ts'),
      'utf8'
    );

    assert.match(apiClientSource, /getApiSessionExpiredMessage\(body\)/);
    assert.doesNotMatch(
      apiClientSource,
      /new ApiSessionExpiredError\(getApiErrorMessage/
    );
  });

  it('normalizes generic protected-route auth failures to session recovery copy', () => {
    assert.equal(
      getApiSessionExpiredMessage({ detail: 'Not authenticated' }),
      LUNARCHAIN_SESSION_EXPIRED_MESSAGE
    );
    assert.equal(
      getApiSessionExpiredMessage({ error: { message: '  Could not validate credentials  ' } }),
      LUNARCHAIN_SESSION_EXPIRED_MESSAGE
    );
    assert.equal(
      getApiSessionExpiredMessage({ detail: 'Traceback: token decoder stack trace' }),
      LUNARCHAIN_SESSION_EXPIRED_MESSAGE
    );
    assert.equal(
      getApiSessionExpiredMessage({ detail: 'SQLSTATE 23505 duplicate key value violates constraint' }),
      LUNARCHAIN_SESSION_EXPIRED_MESSAGE
    );
    assert.equal(
      getApiSessionExpiredMessage({ detail: '{"error":"token decoder stack trace"}' }),
      LUNARCHAIN_SESSION_EXPIRED_MESSAGE
    );
    assert.equal(
      getApiSessionExpiredMessage({ detail: { message: 'Password changed. Sign in again.' } }),
      'Password changed. Sign in again.'
    );
  });

  it('maps request status diagnostics to production-safe user copy', () => {
    assert.equal(
      getUserFacingErrorMessage(new ApiRequestError('Internal Server Error', 503), 'fallback'),
      LUNARCHAIN_SERVER_ERROR
    );
    assert.equal(
      getUserFacingErrorMessage(new ApiRequestError('Too many attempts', 429), 'fallback'),
      LUNARCHAIN_RATE_LIMIT_ERROR
    );
    assert.equal(
      getUserFacingErrorMessage(new ApiRequestError('Network request failed', 0), 'fallback', 'offline copy'),
      'offline copy'
    );
    assert.equal(isUnsafeDiagnosticMessage('Traceback: stack trace'), true);
    assert.equal(isUnsafeDiagnosticMessage('SQLSTATE 23505 duplicate key value violates constraint'), true);
    assert.equal(isUnsafeDiagnosticMessage('File "/app/auth.py", line 42, in login'), true);
    assert.equal(isUnsafeDiagnosticMessage('{"detail":"backend exception"}'), true);
    assert.equal(getUserFacingErrorMessage(new Error('Internal Server Error'), 'fallback'), 'fallback');
    assert.equal(getUserFacingErrorMessage(new Error('SQLSTATE 23505 duplicate key'), 'fallback'), 'fallback');
    assert.equal(getUserFacingErrorMessage(new Error('{"detail":"backend exception"}'), 'fallback'), 'fallback');
    assert.equal(getUserFacingErrorMessage(new Error('Verification code expired.'), 'fallback'), 'Verification code expired.');
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
