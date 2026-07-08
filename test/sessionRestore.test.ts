import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiSessionExpiredError } from '../src/features/api/apiClientCore';
import { restoreSavedSession } from '../src/features/auth/sessionRestore';
import type { AuthSession } from '../src/features/auth/authTypes';

function tokenWithPayload(payload: object): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encodedPayload}.signature`;
}

describe('saved LunarChain session restore', () => {
  const storedSession: AuthSession = {
    accessToken: tokenWithPayload({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    email: 'saved@example.com'
  };

  it('restores and refreshes the stored user when online validation succeeds', async () => {
    const result = await restoreSavedSession(storedSession, async () => ({
      email: 'fresh@example.com',
      name: 'Fresh User'
    }));

    assert.equal(result.status, 'restored');
    assert.equal(result.validatedOnline, true);
    assert.equal(result.session.email, 'fresh@example.com');
    assert.equal(result.session.user?.name, 'Fresh User');
  });

  it('expires stored sessions when the token is already stale', async () => {
    const result = await restoreSavedSession(
      {
        accessToken: tokenWithPayload({ exp: 100 }),
        email: 'expired@example.com'
      },
      async () => {
        throw new Error('should not validate expired tokens');
      }
    );

    assert.equal(result.status, 'expired');
    assert.match(result.message, /session expired/i);
  });

  it('expires blank stored tokens without calling user validation', async () => {
    let validated = false;
    const result = await restoreSavedSession(
      {
        accessToken: '   ',
        email: 'saved@example.com'
      },
      async () => {
        validated = true;
        return { email: 'saved@example.com' };
      }
    );

    assert.equal(result.status, 'expired');
    assert.match(result.message, /session expired/i);
    assert.equal(validated, false);
  });

  it('expires stored sessions when the hosted API rejects the token', async () => {
    const result = await restoreSavedSession(storedSession, async () => {
      throw new ApiSessionExpiredError('Saved token is no longer valid.');
    });

    assert.equal(result.status, 'expired');
    assert.equal(result.message, 'Saved token is no longer valid.');
  });

  it('keeps a non-expired saved session through transient validation failures', async () => {
    const result = await restoreSavedSession(storedSession, async () => {
      throw new Error('Network request failed');
    });

    assert.equal(result.status, 'restored');
    assert.equal(result.validatedOnline, false);
    assert.equal(result.session.email, storedSession.email);
    assert.match(result.message || '', /saved LunarChain session/i);
  });

  it('requires online validation before restoring opaque saved sessions', async () => {
    const result = await restoreSavedSession(
      {
        accessToken: 'opaque-token',
        email: 'opaque@example.com'
      },
      async () => {
        throw new Error('Network request failed');
      }
    );

    assert.equal(result.status, 'expired');
    assert.match(result.message, /online validation/i);
  });
});
