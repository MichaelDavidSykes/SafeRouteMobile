import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getLoginMapReturnActionState,
  getLoginPrimaryActionState,
  getTwoFactorSecondaryActionState
} from '../src/features/auth/loginFormState';

describe('login form primary action state', () => {
  it('keeps credential sign-in disabled until email and password are present', () => {
    assert.deepEqual(
      getLoginPrimaryActionState({
        challengeActive: false,
        challengeExpired: false,
        code: '',
        email: '   ',
        loading: false,
        password: 'secret'
      }),
      {
        accessibilityHint: 'Enter both email and password before signing in.',
        accessibilityLabel: 'Sign in to LunarChain. Email and password required.',
        disabled: true,
        text: 'Sign in'
      }
    );

    assert.equal(
      getLoginPrimaryActionState({
        challengeActive: false,
        challengeExpired: false,
        code: '',
        email: 'driver@example.com',
        loading: false,
        password: 'secret'
      }).disabled,
      false
    );
  });

  it('keeps two-factor verification disabled until a clean six-digit code is present', () => {
    assert.deepEqual(
      getLoginPrimaryActionState({
        challengeActive: true,
        challengeExpired: false,
        code: '12 34',
        email: 'driver@example.com',
        loading: false,
        password: 'secret'
      }),
      {
        accessibilityHint: 'Enter all six digits from the LunarChain login code.',
        accessibilityLabel: 'Verify LunarChain login code. Six digits required.',
        disabled: true,
        text: 'Verify code'
      }
    );

    assert.equal(
      getLoginPrimaryActionState({
        challengeActive: true,
        challengeExpired: false,
        code: '12 34-56',
        email: 'driver@example.com',
        loading: false,
        password: 'secret'
      }).disabled,
      false
    );
  });

  it('uses clear disabled copy for loading and expired code states', () => {
    assert.deepEqual(
      getLoginPrimaryActionState({
        challengeActive: true,
        challengeExpired: false,
        code: '123456',
        email: 'driver@example.com',
        loading: true,
        password: 'secret'
      }),
      {
        accessibilityHint: 'Wait for LunarChain to verify the current login code.',
        accessibilityLabel: 'Verifying LunarChain login code',
        disabled: true,
        text: 'Verifying code'
      }
    );

    assert.deepEqual(
      getLoginPrimaryActionState({
        challengeActive: true,
        challengeExpired: true,
        code: '123456',
        email: 'driver@example.com',
        loading: false,
        password: 'secret'
      }),
      {
        accessibilityHint: 'Go back and sign in again to request a fresh code.',
        accessibilityLabel: 'LunarChain login code expired',
        disabled: true,
        text: 'Code expired'
      }
    );
  });

  it('uses recovery-focused two-factor secondary action copy', () => {
    assert.deepEqual(getTwoFactorSecondaryActionState(false), {
      accessibilityHint: 'Returns to email and password sign-in.',
      accessibilityLabel: 'Go back to LunarChain credentials',
      text: 'Edit sign-in'
    });

    assert.deepEqual(getTwoFactorSecondaryActionState(true), {
      accessibilityHint: 'Returns to credentials so you can request a fresh login code.',
      accessibilityLabel: 'Request a fresh LunarChain login code',
      text: 'Request code'
    });
  });

  it('uses concise visible map return copy while preserving guest context', () => {
    assert.deepEqual(getLoginMapReturnActionState(), {
      accessibilityHint: 'Returns to the map-first SafeRoute home without signing in.',
      accessibilityLabel: 'Continue using the SafeRoute map without signing in',
      text: 'Map'
    });
  });
});
