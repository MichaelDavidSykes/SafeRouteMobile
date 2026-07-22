import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseAccountInvitationToken,
  serializeAccountInvitationToken,
} from '../src/features/auth/accountInvitationStorageCore';

describe('pending account invitation storage', () => {
  const nowMs = Date.UTC(2026, 6, 22, 12, 0, 0);

  it('round-trips only the invitation capability in a versioned envelope', () => {
    const serialized = serializeAccountInvitationToken(' secure-token-123 ', nowMs);

    assert.deepEqual(JSON.parse(serialized), {
      storedAtMs: nowMs,
      token: 'secure-token-123',
      version: 1,
    });
    assert.equal(parseAccountInvitationToken(serialized, nowMs), 'secure-token-123');
  });

  it('rejects expired, future, malformed, and implausible envelopes', () => {
    const valid = serializeAccountInvitationToken('secure-token-123', nowMs);

    assert.equal(parseAccountInvitationToken(valid, nowMs + 48 * 60 * 60 * 1000 + 1), '');
    assert.equal(parseAccountInvitationToken(valid, nowMs - 5 * 60 * 1000 - 1), '');
    assert.equal(parseAccountInvitationToken('{not-json', nowMs), '');
    assert.equal(serializeAccountInvitationToken('short', nowMs), '');
    assert.equal(
      parseAccountInvitationToken(
        JSON.stringify({ storedAtMs: nowMs, token: 'secure-token-123', version: 2 }),
        nowMs
      ),
      ''
    );
  });
});
