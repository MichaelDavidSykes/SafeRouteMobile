import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ApiAuthorizationError,
  ApiSessionExpiredError
} from '../src/features/api/apiClientCore';
import { restoreSavedSession } from '../src/features/auth/sessionRestore';
import type { AuthSession } from '../src/features/auth/authTypes';

function tokenWithPayload(payload: object, header: object = { alg: 'HS256', typ: 'JWT' }): string {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedHeader}.${encodedPayload}.signature`;
}

function accessToken(overrides: Record<string, unknown> = {}): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return tokenWithPayload({
    sub: 'saved@example.com',
    typ: 'access',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
    ...overrides
  });
}

describe('saved LunarChain session restore', () => {
  const storedSession: AuthSession = {
    accessToken: accessToken(),
    email: 'saved@example.com',
    principalId: 'user-saved'
  };

  it('restores and refreshes the stored user when online validation succeeds', async () => {
    const result = await restoreSavedSession(storedSession, async () => ({
      email: 'fresh@example.com',
      id: ' user-saved ',
      name: 'Fresh User'
    }));

    assert.equal(result.status, 'restored');
    assert.equal(result.validatedOnline, true);
    assert.equal(result.session.email, 'fresh@example.com');
    assert.equal(result.session.principalId, 'user-saved');
    assert.equal(result.session.user?.name, 'Fresh User');
  });

  it('fails closed when hosted validation changes the saved stable principal', async () => {
    const result = await restoreSavedSession(storedSession, async () => ({
      email: storedSession.email,
      id: 'user-fresh',
      name: 'Another Account'
    }));

    assert.deepEqual(result, {
      status: 'expired',
      message: 'This saved session belongs to another account. Sign in again.',
      reason: 'principal-changed'
    });
  });

  it('allows online validation to repair a saved session with missing local email', async () => {
    const result = await restoreSavedSession(
      {
        accessToken: storedSession.accessToken,
        email: '   '
      },
      async () => ({
        email: 'fresh@example.com',
        id: 'user-fresh',
        name: 'Fresh User'
      })
    );

    assert.equal(result.status, 'restored');
    assert.equal(result.validatedOnline, true);
    assert.equal(result.session.email, 'fresh@example.com');
    assert.equal(result.session.user?.name, 'Fresh User');
  });

  it('expires stored sessions when the token is already stale', async () => {
    const result = await restoreSavedSession(
      {
        accessToken: accessToken({ iat: 50, exp: 100 }),
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

  it('expires rather than offline-restoring an authoritatively inactive account', async () => {
    const result = await restoreSavedSession(storedSession, async () => {
      throw new ApiSessionExpiredError(
        'This LunarChain account is inactive. Contact an administrator or sign in with another account.',
        'inactive-account',
      );
    });

    assert.equal(result.status, 'expired');
    assert.equal(
      result.message,
      'This LunarChain account is inactive. Contact an administrator or sign in with another account.',
    );
    assert.equal(result.reason, 'inactive-account');
  });

  it('normalizes generic hosted auth rejections to calm session recovery copy', async () => {
    const result = await restoreSavedSession(storedSession, async () => {
      throw new ApiSessionExpiredError('  Could not validate credentials  ');
    });

    assert.equal(result.status, 'expired');
    assert.equal(result.message, 'Your LunarChain session expired. Sign in again.');
  });

  it('hides unsafe hosted auth diagnostics during session restore', async () => {
    const unsafeMessages = [
      'Traceback: token validator exception',
      'SQLSTATE 23505 database error from users where id = $1',
      '{"error":"token validator failed"}',
      'TypeError: Cannot read properties of undefined'
    ];

    for (const message of unsafeMessages) {
      const result = await restoreSavedSession(storedSession, async () => {
        throw new ApiSessionExpiredError(message);
      });

      assert.equal(result.status, 'expired');
      assert.equal(result.message, 'Your LunarChain session expired. Sign in again.');
    }
  });

  it('keeps principal-scoped data closed when online validation is unavailable', async () => {
    const result = await restoreSavedSession(storedSession, async () => {
      throw new Error('Network request failed');
    });

    assert.equal(result.status, 'validation-unavailable');
    assert.equal(
      result.message,
      'SafeRoute could not verify this saved session. Retry or sign in again.',
    );
  });

  it('restores a strict principal-bound saved session offline without calling hosted validation', async () => {
    let validated = false;
    const result = await restoreSavedSession(
      storedSession,
      async () => {
        validated = true;
        throw new Error('should not validate while offline');
      },
      { validateOnline: false },
    );

    assert.equal(validated, false);
    assert.equal(result.status, 'restored');
    assert.equal(result.validatedOnline, false);
    assert.equal(result.session.principalId, storedSession.principalId);
  });

  it('keeps a quarantined saved session dormant across an offline retry or relaunch', async () => {
    let validated = false;
    const result = await restoreSavedSession(
      {
        ...storedSession,
        onlineValidationRequired: true,
      },
      async () => {
        validated = true;
        throw new Error('should not validate while offline');
      },
      { validateOnline: false },
    );

    assert.equal(validated, false);
    assert.deepEqual(result, {
      status: 'validation-unavailable',
      message:
        'SafeRoute could not verify this saved session. Retry or sign in again.',
    });
  });

  it('releases a quarantined saved session only after matching online validation', async () => {
    const result = await restoreSavedSession(
      {
        ...storedSession,
        onlineValidationRequired: true,
      },
      async () => ({
        email: storedSession.email,
        id: storedSession.principalId,
        name: 'Validated Driver',
      }),
      { validateOnline: true },
    );

    assert.equal(result.status, 'restored');
    assert.equal(result.validatedOnline, true);
    assert.equal(result.session.onlineValidationRequired, undefined);
    assert.equal(result.session.user?.name, 'Validated Driver');
  });

  it('rejects locally untrusted sessions offline without calling hosted validation', async () => {
    for (const session of [
      { ...storedSession, accessToken: 'opaque-token' },
      { ...storedSession, principalId: undefined },
      { ...storedSession, email: 'another@example.com' },
    ]) {
      let validated = false;
      const result = await restoreSavedSession(
        session,
        async () => {
          validated = true;
          throw new Error('should not validate while offline');
        },
        { validateOnline: false },
      );

      assert.equal(validated, false);
      assert.equal(result.status, 'expired');
      assert.match(result.message, /online validation/i);
    }
  });

  it('does not expose a structurally valid session when online validation returns 403', async () => {
    const result = await restoreSavedSession(storedSession, async () => {
      throw new ApiAuthorizationError('This account cannot access that resource.');
    });

    assert.equal(result.status, 'validation-unavailable');
    assert.match(result.message, /could not verify this saved session/i);
  });

  it('rejects locally untrusted opaque sessions when online validation cannot repair them', async () => {
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

  it('requires online validation before restoring structurally invalid JWTs offline', async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const invalidTokens = [
      tokenWithPayload({
        sub: 'saved@example.com',
        typ: 'access',
        iat: nowSeconds,
        exp: nowSeconds + 3600
      }, { alg: 'none' }),
      accessToken({ typ: 'invite' }),
      accessToken({ sub: '' }),
      accessToken({ iat: undefined }),
      accessToken({ exp: undefined }),
      accessToken({ iat: nowSeconds + 3600, exp: nowSeconds + 7200 })
    ];

    for (const invalidToken of invalidTokens) {
      const result = await restoreSavedSession(
        {
          accessToken: invalidToken,
          email: 'saved@example.com'
        },
        async () => {
          throw new Error('Network request failed');
        }
      );

      assert.equal(result.status, 'expired');
      assert.match(result.message, /online validation/i);
    }
  });

  it('requires online validation before offline-restoring sessions without an email identity', async () => {
    const result = await restoreSavedSession(
      {
        accessToken: storedSession.accessToken,
        email: '   '
      },
      async () => {
        throw new Error('Network request failed');
      }
    );

    assert.equal(result.status, 'expired');
    assert.match(result.message, /online validation/i);
  });

  it('requires a trusted principal and matching token subject before offline restore', async () => {
    for (const session of [
      { ...storedSession, principalId: undefined },
      { ...storedSession, email: 'another@example.com' }
    ]) {
      const result = await restoreSavedSession(session, async () => {
        throw new Error('Network request failed');
      });

      assert.equal(result.status, 'expired');
      assert.match(result.message, /online validation/i);
    }
  });
});
