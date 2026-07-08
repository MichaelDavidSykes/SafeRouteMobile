import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getJwtExpirySeconds, isJwtExpired } from '../src/features/auth/jwt';

function tokenWithPayload(payload: object): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString('base64url');
  return `header.${encodedPayload}.signature`;
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
});
