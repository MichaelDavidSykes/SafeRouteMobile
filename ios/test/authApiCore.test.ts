import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApiRequestError, ApiSessionExpiredError } from '../src/features/api/apiClientCore';
import {
  ACCOUNT_ALREADY_EXISTS_MESSAGE,
  AccountAlreadyExistsError,
  assertAuthResponseOk,
  assertPublicAuthResponseOk,
  isAccountAlreadyExistsResponse,
} from '../src/features/auth/authApiCore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

describe('LunarChain auth API core', () => {
  it('throws typed request errors for non-auth service failures', async () => {
    await assert.rejects(
      () =>
        assertAuthResponseOk(
          jsonResponse(503, {
            detail: {
              message: 'Internal Server Error'
            }
          }),
          'Unable to sign in.'
        ),
      (error) =>
        error instanceof ApiRequestError &&
        error.statusCode === 503 &&
        error.message === 'Internal Server Error'
    );
  });

  it('keeps credential rejections as session/auth failures', async () => {
    await assert.rejects(
      () =>
        assertAuthResponseOk(
          jsonResponse(401, {
            detail: {
              details: 'Invalid username or password.'
            }
          }),
          'Unable to sign in.'
        ),
      (error) => error instanceof ApiSessionExpiredError && error.message === 'Invalid username or password.'
    );
  });

  it('maps the exact inactive-account contract to calm session revocation', async () => {
    await assert.rejects(
      () =>
        assertAuthResponseOk(
          jsonResponse(400, {
            detail: {
              details: 'This account has been deactivated',
              message: 'Inactive user',
            },
          }),
          'Unable to validate the saved session.',
        ),
      (error) =>
        error instanceof ApiSessionExpiredError &&
        error.message ===
          'This LunarChain account is inactive. Contact an administrator or sign in with another account.',
    );

    await assert.rejects(
      () =>
        assertAuthResponseOk(
          jsonResponse(400, {
            detail: {
              details: 'Account setup is incomplete',
              message: 'Inactive user',
            },
          }),
          'Unable to validate the saved session.',
        ),
      (error) => error instanceof ApiRequestError && error.statusCode === 400,
    );
  });

  it('ignores malformed JSON and returns an empty body for successful empty responses', async () => {
    const malformed = new Response('not-json', { status: 200 });
    assert.deepEqual(await assertAuthResponseOk(malformed, 'fallback'), {});

    const empty = new Response('', { status: 200 });
    assert.deepEqual(await assertAuthResponseOk(empty, 'fallback'), {});
  });

  it('keeps public registration policy failures as request errors', async () => {
    await assert.rejects(
      () =>
        assertPublicAuthResponseOk(
          jsonResponse(403, {
            detail: {
              details: 'Account creation is invitation-only.',
            },
          }),
          'Unable to create the account.'
        ),
      (error) =>
        error instanceof ApiRequestError &&
        error.statusCode === 403 &&
        error.message === 'Account creation is invitation-only.'
    );
  });

  it('classifies the stable duplicate-account conflict for an explicit sign-in handoff', async () => {
    await assert.rejects(
      () =>
        assertPublicAuthResponseOk(
          jsonResponse(409, {
            detail: {
              code: 'account_exists',
              details: ACCOUNT_ALREADY_EXISTS_MESSAGE,
              message: 'Account already exists',
            },
          }),
          'Unable to create the account.'
        ),
      (error) =>
        error instanceof AccountAlreadyExistsError &&
        error.statusCode === 409 &&
        error.message === ACCOUNT_ALREADY_EXISTS_MESSAGE
    );
  });

  it('recognizes the prior duplicate-account response during a rolling backend deployment', () => {
    assert.equal(
      isAccountAlreadyExistsResponse(400, {
        detail: {
          details: 'A user with this email already exists',
          message: 'User already exists',
        },
      }),
      true
    );
    assert.equal(
      isAccountAlreadyExistsResponse(400, {
        detail: { details: 'The invitation is no longer available.' },
      }),
      false
    );
  });
});
