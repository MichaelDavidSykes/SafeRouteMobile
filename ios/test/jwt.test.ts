import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  JWT_CLOCK_SKEW_SECONDS,
  getJwtExpirySeconds,
  getOfflineAccessJwtClaims,
  isJwtExpired
} from '../src/features/auth/jwt';

function tokenWithPayload(
  payload: object,
  header: object = { alg: 'HS256', typ: 'JWT' },
  signature = 'signature'
): string {
  const encodedHeader = Buffer.from(JSON.stringify(header))
    .toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

describe('JWT expiry helpers', () => {
  it('reads JWT expiry from the access token payload', () => {
    const token = tokenWithPayload({ exp: 200 });

    assert.equal(getJwtExpirySeconds(token), 200);
  });

  it('treats expired JWT sessions as invalid', () => {
    const token = tokenWithPayload({ exp: 100 });

    assert.equal(isJwtExpired(token, 160, 30), true);
  });

  it('leaves opaque tokens alone when no expiry is present', () => {
    assert.equal(isJwtExpired('opaque-token'), false);
  });

  it('accepts structurally valid access claims for offline restore', () => {
    const token = tokenWithPayload({
      sub: 'driver@example.com',
      typ: 'access',
      iat: 1_000,
      exp: 2_000
    });

    assert.deepEqual(getOfflineAccessJwtClaims(token, 1_000), {
      sub: 'driver@example.com',
      typ: 'access',
      iat: 1_000,
      exp: 2_000
    });
  });

  it('requires exactly three non-empty JWT segments', () => {
    const validToken = tokenWithPayload({
      sub: 'driver@example.com',
      typ: 'access',
      iat: 1_000,
      exp: 2_000
    });

    assert.equal(getOfflineAccessJwtClaims('opaque-token', 1_000), null);
    assert.equal(getOfflineAccessJwtClaims(`${validToken}.extra`, 1_000), null);
    assert.equal(getOfflineAccessJwtClaims(validToken.replace(/\.signature$/, '.'), 1_000), null);
  });

  it('rejects unsigned and non-access JWTs for offline restore', () => {
    const claims = {
      sub: 'driver@example.com',
      typ: 'access',
      iat: 1_000,
      exp: 2_000
    };

    assert.equal(getOfflineAccessJwtClaims(tokenWithPayload(claims, { alg: 'none' }), 1_000), null);
    assert.equal(getOfflineAccessJwtClaims(tokenWithPayload(claims, {}), 1_000), null);
    assert.equal(
      getOfflineAccessJwtClaims(tokenWithPayload({ ...claims, typ: 'invite' }), 1_000),
      null
    );
  });

  it('requires subject and finite numeric issued-at and expiry claims', () => {
    const claims = {
      sub: 'driver@example.com',
      typ: 'access',
      iat: 1_000,
      exp: 2_000
    };

    for (const invalidClaims of [
      { ...claims, sub: '' },
      { ...claims, iat: undefined },
      { ...claims, iat: '1000' },
      { ...claims, exp: undefined },
      { ...claims, exp: Number.POSITIVE_INFINITY },
      { ...claims, exp: claims.iat }
    ]) {
      assert.equal(getOfflineAccessJwtClaims(tokenWithPayload(invalidClaims), 1_000), null);
    }
  });

  it('allows normal clock skew but rejects tokens issued too far in the future', () => {
    const claims = {
      sub: 'driver@example.com',
      typ: 'access',
      exp: 2_000
    };

    assert.notEqual(
      getOfflineAccessJwtClaims(
        tokenWithPayload({ ...claims, iat: 1_000 + JWT_CLOCK_SKEW_SECONDS }),
        1_000
      ),
      null
    );
    assert.equal(
      getOfflineAccessJwtClaims(
        tokenWithPayload({ ...claims, iat: 1_001 + JWT_CLOCK_SKEW_SECONDS }),
        1_000
      ),
      null
    );
  });
});
