import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiSessionExpiredError } from '../src/features/api/apiClientCore';
import { prepareAuthenticatedSession } from '../src/features/auth/authCompletion';
import type { AuthSession } from '../src/features/auth/authTypes';

describe('auth completion', () => {
  const session: AuthSession = {
    accessToken: 'token-123',
    email: 'typed@example.com'
  };

  it('validates the accepted session and persists refreshed user details', async () => {
    let savedSession: AuthSession | undefined;

    const result = await prepareAuthenticatedSession(
      session,
      async (nextSession) => {
        savedSession = nextSession;
      },
      async (accessToken) => {
        assert.equal(accessToken, 'token-123');
        return {
          email: 'canonical@example.com',
          name: 'Canonical User'
        };
      }
    );

    assert.deepEqual(savedSession, {
      ...session,
      email: 'canonical@example.com',
      user: {
        email: 'canonical@example.com',
        name: 'Canonical User'
      }
    });
    assert.equal(result.email, 'canonical@example.com');
    assert.equal(result.user?.name, 'Canonical User');
  });

  it('does not continue into the signed-in app when secure session storage fails', async () => {
    await assert.rejects(
      () =>
        prepareAuthenticatedSession(
          session,
          async () => {
            throw new Error('SecureStore unavailable');
          },
          async () => ({ email: 'user@example.com' })
        ),
      /SecureStore unavailable/
    );
  });

  it('rejects blank access tokens before validation or persistence', async () => {
    let validated = false;
    let saved = false;

    await assert.rejects(
      () =>
        prepareAuthenticatedSession(
          {
            accessToken: '   ',
            email: 'typed@example.com'
          },
          async () => {
            saved = true;
          },
          async () => {
            validated = true;
            return { email: 'user@example.com' };
          }
        ),
      (error) => error instanceof ApiSessionExpiredError && /sign in again/i.test(error.message)
    );

    assert.equal(validated, false);
    assert.equal(saved, false);
  });

  it('keeps the signed-in session when the user refresh request is temporarily unavailable', async () => {
    let savedSession: AuthSession | undefined;
    const result = await prepareAuthenticatedSession(
      session,
      async (nextSession) => {
        savedSession = nextSession;
      },
      async () => {
        throw new Error('Network request failed');
      }
    );

    assert.deepEqual(savedSession, session);
    assert.equal(result.email, 'typed@example.com');
    assert.equal(result.user, undefined);
  });

  it('rejects and does not persist sessions that fail online auth validation', async () => {
    let saved = false;

    await assert.rejects(
      () =>
        prepareAuthenticatedSession(
          session,
          async () => {
            saved = true;
          },
          async () => {
            throw new ApiSessionExpiredError('Fresh token rejected.');
          }
        ),
      /Fresh token rejected/
    );

    assert.equal(saved, false);
  });
});
