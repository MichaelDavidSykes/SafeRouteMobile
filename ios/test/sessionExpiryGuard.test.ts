import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiAuthorizationError, ApiRequestError, ApiSessionExpiredError } from '../src/features/api/apiClientCore';
import {
  shouldHandleActiveSessionExpiry,
  getRequestSessionExpiry,
  waitForSessionCleanup
} from '../src/features/api/sessionExpiry';

describe('session expiry guards', () => {
  it('accepts one active authenticated 401 and deduplicates split requests', () => {
    const error = new ApiSessionExpiredError('Token rejected.');
    let handled = false;
    let callbackCount = 0;

    for (const _chunk of [0, 1]) {
      if (getRequestSessionExpiry({
        authenticated: true,
        error,
        handled,
        requestActive: true
      })) {
        handled = true;
        callbackCount += 1;
      }
    }

    assert.equal(callbackCount, 1);
  });

  it('rejects stale, aborted, public, permission, and network failures', () => {
    const expired = new ApiSessionExpiredError();
    assert.equal(getRequestSessionExpiry({
      authenticated: true,
      error: expired,
      handled: false,
      requestActive: false
    }), null);
    assert.equal(getRequestSessionExpiry({
      authenticated: false,
      error: expired,
      handled: false,
      requestActive: true
    }), null);
    assert.equal(getRequestSessionExpiry({
      authenticated: true,
      error: new ApiAuthorizationError(),
      handled: false,
      requestActive: true
    }), null);
    assert.equal(getRequestSessionExpiry({
      authenticated: true,
      error: new ApiRequestError('Offline', 0),
      handled: false,
      requestActive: true
    }), null);
  });

  it('accepts only the token belonging to the current authenticated generation', () => {
    assert.equal(shouldHandleActiveSessionExpiry({
      activeAccessToken: 'new-session',
      activeSessionEpoch: 2,
      expiredAccessToken: 'new-session',
      expiredSessionEpoch: 2,
      handled: false
    }), true);
    assert.equal(shouldHandleActiveSessionExpiry({
      activeAccessToken: 'new-session',
      activeSessionEpoch: 2,
      expiredAccessToken: 'old-session',
      expiredSessionEpoch: 1,
      handled: false
    }), false);
    assert.equal(shouldHandleActiveSessionExpiry({
      activeAccessToken: 'new-session',
      activeSessionEpoch: 2,
      expiredAccessToken: 'new-session',
      expiredSessionEpoch: 2,
      handled: true
    }), false);
    assert.equal(shouldHandleActiveSessionExpiry({
      activeAccessToken: null,
      activeSessionEpoch: 2,
      expiredAccessToken: 'old-session',
      expiredSessionEpoch: 1,
      handled: false
    }), false);
    assert.equal(shouldHandleActiveSessionExpiry({
      activeAccessToken: 'same-token',
      activeSessionEpoch: 2,
      expiredAccessToken: 'same-token',
      expiredSessionEpoch: 1,
      handled: false
    }), false);
  });

  it('waits for prior credential cleanup before continuing authentication', async () => {
    let resolveCleanup: (() => void) | null = null;
    const events: string[] = [];
    const cleanup = new Promise<void>((resolve) => {
      resolveCleanup = resolve;
    });
    const authenticate = (async () => {
      await waitForSessionCleanup(cleanup);
      events.push('save-new-session');
    })();

    await Promise.resolve();
    assert.deepEqual(events, []);
    resolveCleanup?.();
    await authenticate;
    assert.deepEqual(events, ['save-new-session']);
  });
});
