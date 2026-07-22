import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildAuthContentHeaders,
  buildLoginCodePayload,
  buildLoginCodeResendPayload,
  buildPasswordLoginBody,
  buildPasswordResetPayload,
  buildPasswordResetRequestPayload,
  getAuthErrorMessage,
  normalizeEmail,
  unwrapAuthData
} from '../src/features/auth/authPayload';

describe('LunarChain auth payload helpers', () => {
  it('normalizes email addresses for login', () => {
    assert.equal(normalizeEmail('  USER@Example.COM  '), 'user@example.com');
  });

  it('builds the same form body shape as the LunarChain web login', () => {
    const body = buildPasswordLoginBody(' user@example.com ', 'secret pass');

    assert.equal(body, 'username=user%40example.com&password=secret+pass');
  });

  it('builds the same MFA payloads as the LunarChain web client', () => {
    assert.deepEqual(
      buildLoginCodePayload(' Operator@Example.com ', 'challenge-1', ' 123456 '),
      {
        challenge_token: 'challenge-1',
        code: '123456',
        email: 'operator@example.com',
      }
    );
    assert.deepEqual(
      buildLoginCodeResendPayload(' Operator@Example.com ', 'challenge-1'),
      {
        challenge_token: 'challenge-1',
        email: 'operator@example.com',
      }
    );
  });

  it('builds normalized password-reset request and completion payloads', () => {
    assert.deepEqual(buildPasswordResetRequestPayload(' Operator@Example.com '), {
      email: 'operator@example.com',
    });
    assert.deepEqual(
      buildPasswordResetPayload(' Operator@Example.com ', ' 123456 ', 'Strong!123'),
      {
        code: '123456',
        email: 'operator@example.com',
        new_password: 'Strong!123',
      }
    );
  });

  it('builds content headers without a client-spoofing authentication bypass marker', () => {
    assert.deepEqual(buildAuthContentHeaders('application/x-www-form-urlencoded'), {
      'Content-Type': 'application/x-www-form-urlencoded'
    });
  });

  it('uses the dedicated mobile endpoint for password requests', () => {
    const source = readFileSync(join(process.cwd(), 'src/features/auth/authApi.ts'), 'utf8');

    assert.match(source, /\/auth\/mobile-login/);
    assert.match(source, /headers: buildAuthContentHeaders\('application\/x-www-form-urlencoded'\)/);
    assert.match(source, /headers: buildAuthContentHeaders\('application\/json'\)/);
    assert.doesNotMatch(source, /X-SafeRoute-Client/);
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

  it('uses backend validation and nested error copy for auth failures', () => {
    assert.equal(
      getAuthErrorMessage(
        {
          detail: [
            {
              loc: ['body', 'username'],
              msg: 'Please enter a valid email address.',
              type: 'value_error'
            }
          ]
        },
        'fallback'
      ),
      'Please enter a valid email address.'
    );
    assert.equal(getAuthErrorMessage({ error: { details: '  Verification is temporarily unavailable.  ' } }, 'fallback'), 'Verification is temporarily unavailable.');
  });
});
