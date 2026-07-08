import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  SAFEROUTE_MOBILE_AUTH_CLIENT,
  SAFEROUTE_MOBILE_AUTH_CLIENT_HEADER,
  buildMobileAuthHeaders,
  buildMobileClientHeaders,
  buildPasswordLoginBody,
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

  it('marks SafeRoute Mobile auth requests for the backend mobile client path', () => {
    assert.deepEqual(buildMobileAuthHeaders('application/x-www-form-urlencoded'), {
      'Content-Type': 'application/x-www-form-urlencoded',
      [SAFEROUTE_MOBILE_AUTH_CLIENT_HEADER]: SAFEROUTE_MOBILE_AUTH_CLIENT
    });
  });

  it('uses the mobile client header for password and verification requests', () => {
    const source = readFileSync(join(process.cwd(), 'src/features/auth/authApi.ts'), 'utf8');

    assert.match(source, /headers: buildMobileAuthHeaders\('application\/x-www-form-urlencoded'\)/);
    assert.match(source, /headers: buildMobileAuthHeaders\('application\/json'\)/);
  });

  it('marks bearer session validation requests for the mobile client path', () => {
    const headers = buildMobileClientHeaders({
      Authorization: 'Bearer token-1'
    });

    assert.equal(headers.Authorization, 'Bearer token-1');
    assert.equal(headers[SAFEROUTE_MOBILE_AUTH_CLIENT_HEADER], SAFEROUTE_MOBILE_AUTH_CLIENT);
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
