import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createStoredAuthSession } from '../src/features/auth/authStorageCore';
import { restoreSavedSession } from '../src/features/auth/sessionRestore';

function tokenWithPayload(payload: object): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encodedPayload}.signature`;
}

describe('stored auth session normalization', () => {
  it('keeps token-only sessions available for online validation repair', async () => {
    const storedSession = createStoredAuthSession(
      ` ${tokenWithPayload({ exp: Math.floor(Date.now() / 1000) + 3600 })} `,
      null
    );

    assert.notEqual(storedSession, null);
    assert.equal(storedSession?.email, '');

    const result = await restoreSavedSession(storedSession, async () => ({
      email: 'repaired@example.com',
      name: 'Repaired Driver'
    }));

    assert.equal(result.status, 'restored');
    assert.equal(result.validatedOnline, true);
    assert.equal(result.session.email, 'repaired@example.com');
    assert.equal(result.session.user?.name, 'Repaired Driver');
  });

  it('requires a stored access token before attempting session restore', () => {
    assert.equal(createStoredAuthSession(null, 'driver@example.com'), null);
    assert.equal(createStoredAuthSession('   ', 'driver@example.com'), null);
  });

  it('trims secure-store token and email values before reuse', () => {
    assert.deepEqual(createStoredAuthSession(' token-123 ', ' Driver@Example.com '), {
      accessToken: 'token-123',
      email: 'Driver@Example.com'
    });
  });
});
