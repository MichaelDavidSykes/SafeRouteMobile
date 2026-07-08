import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPasswordLoginBody, getAuthErrorMessage, normalizeEmail, unwrapAuthData } from '../src/features/auth/authPayload';

describe('LunarChain auth payload helpers', () => {
  it('normalizes email addresses for login', () => {
    assert.equal(normalizeEmail('  USER@Example.COM  '), 'user@example.com');
  });

  it('builds the same form body shape as the LunarChain web login', () => {
    const body = buildPasswordLoginBody(' user@example.com ', 'secret pass');

    assert.equal(body, 'username=user%40example.com&password=secret+pass');
  });

  it('unwraps API data envelopes', () => {
    const payload = unwrapAuthData({
      data: {
        access_token: 'token'
      }
    });

    assert.equal(payload.access_token, 'token');
  });

  it('extracts nested auth error details', () => {
    const message = getAuthErrorMessage(
      {
        detail: {
          details: 'Invalid username or password.'
        }
      },
      'fallback'
    );

    assert.equal(message, 'Invalid username or password.');
  });

  it('trims auth errors and handles alternate backend error shapes', () => {
    assert.equal(getAuthErrorMessage({ detail: '  Verification code expired.  ' }, 'fallback'), 'Verification code expired.');
    assert.equal(getAuthErrorMessage({ details: '   ', message: '  Too many attempts. ' }, 'fallback'), 'Too many attempts.');
    assert.equal(getAuthErrorMessage({ detail: { details: '', message: '  Code does not match.  ' } }, 'fallback'), 'Code does not match.');
  });
});
