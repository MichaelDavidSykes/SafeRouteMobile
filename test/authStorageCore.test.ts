import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  createDeviceOnlySecureStoreOptions,
  createStoredAuthSession
} from '../src/features/auth/authStorageCore';
import { restoreSavedSession } from '../src/features/auth/sessionRestore';

function tokenWithPayload(payload: object): string {
  const encodedHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encodedHeader}.${encodedPayload}.signature`;
}

describe('stored auth session normalization', () => {
  it('keeps token-only sessions available for online validation repair', async () => {
    const storedSession = createStoredAuthSession(
      ` ${tokenWithPayload({
        sub: 'repaired@example.com',
        typ: 'access',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      })} `,
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

  it('uses device-only keychain accessibility when the runtime supports it', () => {
    assert.deepEqual(createDeviceOnlySecureStoreOptions(7), { keychainAccessible: 7 });
    assert.deepEqual(createDeviceOnlySecureStoreOptions(undefined), {});
    assert.deepEqual(createDeviceOnlySecureStoreOptions(Number.NaN), {});

    const authStorageSource = readFileSync(
      join(process.cwd(), 'src/features/auth/authStorage.ts'),
      'utf8'
    );
    assert.match(authStorageSource, /SecureStore\.WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
    assert.match(
      authStorageSource,
      /setItemAsync\(ACCESS_TOKEN_KEY, session\.accessToken, DEVICE_ONLY_SECURE_STORE_OPTIONS\)/
    );
    assert.match(
      authStorageSource,
      /setItemAsync\(EMAIL_KEY, session\.email, DEVICE_ONLY_SECURE_STORE_OPTIONS\)/
    );
  });
});
