import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  createDeviceOnlySecureStoreOptions,
  createStoredAuthSession,
  classifyStoredAuthSessionForContract,
  parseStoredAuthSession,
  serializeSignedOutAuthSession,
  serializeStoredAuthSession
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
      id: 'user-repaired',
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
    assert.deepEqual(createStoredAuthSession(' token-123 ', ' Driver@Example.com ', ' user-123 '), {
      accessToken: 'token-123',
      email: 'Driver@Example.com',
      principalId: 'user-123'
    });
  });

  it('round-trips one atomic identity-bearing session envelope', () => {
    const serialized = serializeStoredAuthSession({
      accessToken: ' token-123 ',
      email: 'driver@example.com',
      principalId: ' user-123 '
    });

    assert.ok(serialized);
    assert.deepEqual(parseStoredAuthSession(serialized), {
      accessToken: 'token-123',
      email: 'driver@example.com',
      principalId: 'user-123'
    });
    assert.equal(serializeStoredAuthSession({ accessToken: 'token', email: 'driver@example.com' }), null);
    assert.equal(parseStoredAuthSession('{"schema":2,"session":{"accessToken":"token"}}'), null);
    assert.equal(parseStoredAuthSession('{bad-json'), null);
  });

  it('uses an authoritative signed-out envelope that cannot fall back to legacy credentials', () => {
    const tombstone = serializeSignedOutAuthSession();

    assert.deepEqual(JSON.parse(tombstone), { schema: 2, signedOut: true });
    assert.equal(parseStoredAuthSession(tombstone), null);

    const authStorageSource = readFileSync(
      join(process.cwd(), 'src/features/auth/authStorage.ts'),
      'utf8'
    );
    const tombstoneWriteIndex = authStorageSource.indexOf(
      'SecureStore.setItemAsync(\n    AUTH_SESSION_KEY,\n    serializeSignedOutAuthSession()'
    );
    const legacyCleanupIndex = authStorageSource.indexOf(
      'SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY)',
      tombstoneWriteIndex
    );

    assert.ok(tombstoneWriteIndex >= 0);
    assert.ok(legacyCleanupIndex > tombstoneWriteIndex);
    assert.doesNotMatch(
      authStorageSource.slice(tombstoneWriteIndex),
      /deleteItemAsync\(AUTH_SESSION_KEY\)/
    );
    assert.equal(classifyStoredAuthSessionForContract(tombstone), 'signed-out');
    assert.equal(
      classifyStoredAuthSessionForContract(serializeStoredAuthSession({
        accessToken: 'token',
        email: 'driver@example.com',
        principalId: 'principal-1',
      })),
      'present',
    );
    assert.equal(classifyStoredAuthSessionForContract('{bad-json'), 'unknown');
    assert.equal(
      classifyStoredAuthSessionForContract(
        '{"schema":2,"signedOut":true,"accessToken":"secret"}',
      ),
      'unknown',
    );
  });

  it('injects the one-shot contract failure immediately before the real auth tombstone', () => {
    const authStorageSource = readFileSync(
      join(process.cwd(), 'src/features/auth/authStorage.ts'),
      'utf8'
    );
    const hookIndex = authStorageSource.indexOf(
      "shouldInjectConnectivityContractStorageFault(\n      'auth-session-tombstone-set'",
    );
    const disabledGateIndex = authStorageSource.indexOf(
      "SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED &&",
    );
    const tombstoneWriteIndex = authStorageSource.indexOf(
      'SecureStore.setItemAsync(\n    AUTH_SESSION_KEY,\n    serializeSignedOutAuthSession()',
    );

    assert.ok(disabledGateIndex >= 0);
    assert.ok(hookIndex > disabledGateIndex);
    assert.ok(tombstoneWriteIndex > hookIndex);
    assert.doesNotMatch(
      authStorageSource.slice(hookIndex, tombstoneWriteIndex),
      /accessToken|EMAIL_KEY|ACCESS_TOKEN_KEY/,
    );
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
      /setItemAsync\(AUTH_SESSION_KEY, serialized, DEVICE_ONLY_SECURE_STORE_OPTIONS\)/
    );
    assert.doesNotMatch(authStorageSource, /setItemAsync\(ACCESS_TOKEN_KEY/);
    assert.doesNotMatch(authStorageSource, /setItemAsync\(EMAIL_KEY/);
  });
});
