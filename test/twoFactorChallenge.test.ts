import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getTwoFactorChallengeState,
  getTwoFactorExpiryDelayMs,
  getTwoFactorSubtitle,
  isTwoFactorChallengeExpired,
  normalizeLoginCode,
  sanitizeLoginCode
} from '../src/features/auth/twoFactorChallenge';

describe('two-factor challenge helpers', () => {
  const now = Date.parse('2026-07-07T10:00:00Z');

  it('sanitizes pasted login codes to six digits', () => {
    assert.equal(sanitizeLoginCode(' 12 3-45a678 '), '123456');
    assert.equal(normalizeLoginCode('code: 123456789'), '123456');
    assert.equal(sanitizeLoginCode('abc'), '');
  });

  it('detects expired challenges without failing on missing or malformed expiry values', () => {
    assert.equal(isTwoFactorChallengeExpired('2026-07-07T09:59:59Z', now), true);
    assert.equal(isTwoFactorChallengeExpired('2026-07-07T10:01:00Z', now), false);
    assert.equal(isTwoFactorChallengeExpired(undefined, now), false);
    assert.equal(isTwoFactorChallengeExpired('not-a-date', now), false);
  });

  it('computes a safe expiry timer delay for the login screen', () => {
    assert.equal(getTwoFactorExpiryDelayMs('2026-07-07T10:00:30Z', now), 30000);
    assert.equal(getTwoFactorExpiryDelayMs('2026-07-07T09:59:00Z', now), 0);
    assert.equal(getTwoFactorExpiryDelayMs('not-a-date', now), null);
  });

  it('uses production-friendly verification copy for fresh and expired challenges', () => {
    assert.equal(
      getTwoFactorSubtitle(
        {
          email: 'driver@example.com',
          challengeToken: 'token',
          method: 'email_code',
          expiresAt: '2026-07-07T10:01:00Z'
        },
        now
      ),
      'Enter the 6-digit code sent by email.'
    );

    assert.equal(
      getTwoFactorSubtitle(
        {
          email: 'driver@example.com',
          challengeToken: 'token',
          method: 'email',
          expiresAt: '2026-07-07T09:59:00Z'
        },
        now
      ),
      'Request a fresh code to continue.'
    );
  });

  it('describes challenge expiry state for concise two-factor helper copy', () => {
    assert.deepEqual(
      getTwoFactorChallengeState(
        {
          email: 'driver@example.com',
          challengeToken: 'token',
          method: 'email',
          expiresAt: 'not-a-date'
        },
        new Date(now)
      ),
      {
        expired: false,
        helperText: 'Use the most recent code.',
        tone: 'neutral'
      }
    );

    assert.deepEqual(
      getTwoFactorChallengeState(
        {
          email: 'driver@example.com',
          challengeToken: 'token',
          method: 'email',
          expiresAt: '2026-07-07T10:00:30Z'
        },
        new Date(now)
      ),
      {
        expired: false,
        helperText: 'Expires in 1 min.',
        tone: 'neutral'
      }
    );

    assert.deepEqual(
      getTwoFactorChallengeState(
        {
          email: 'driver@example.com',
          challengeToken: 'token',
          method: 'email',
          expiresAt: '2026-07-07T09:59:59Z'
        },
        new Date(now)
      ),
      {
        expired: true,
        helperText: 'This code expired.',
        tone: 'danger'
      }
    );
  });
});
