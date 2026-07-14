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
          id: 'user-canonical',
          name: 'Canonical User'
        };
      }
    );

    assert.deepEqual(savedSession, {
      ...session,
      email: 'canonical@example.com',
      principalId: 'user-canonical',
      user: {
        email: 'canonical@example.com',
        id: 'user-canonical',
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
          async () => ({ email: 'user@example.com', id: 'user-123' })
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

  it('requires fresh account identity before persisting a newly authenticated session', async () => {
    let saved = false;
    await assert.rejects(
      () => prepareAuthenticatedSession(
        session,
        async () => {
          saved = true;
        },
        async () => {
          throw new Error('Network request failed');
        }
      ),
      /verify the LunarChain account identity/i,
    );
    assert.equal(saved, false);
  });

  it('retains an already trusted principal during a transient user refresh failure', async () => {
    const trustedSession = { ...session, principalId: 'user-123' };
    let savedSession: AuthSession | undefined;
    const result = await prepareAuthenticatedSession(
      trustedSession,
      async (nextSession) => {
        savedSession = nextSession;
      },
      async () => {
        throw new Error('Network request failed');
      }
    );

    assert.deepEqual(savedSession, trustedSession);
    assert.equal(result.principalId, 'user-123');
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
