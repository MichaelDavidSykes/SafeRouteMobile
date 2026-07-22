import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getPasswordResetError,
  getPasswordResetRequestError,
  isStrongPassword,
} from '../src/features/auth/passwordResetState';

describe('password reset state', () => {
  it('requires a complete email address before requesting a code', () => {
    assert.equal(getPasswordResetRequestError('operator'), 'Enter a valid email address.');
    assert.equal(getPasswordResetRequestError(' Operator@Example.com '), null);
  });

  it('matches the LunarChain password-strength contract', () => {
    assert.equal(isStrongPassword('short'), false);
    assert.equal(isStrongPassword('NoSymbol123'), false);
    assert.equal(isStrongPassword('Strong!123'), true);
  });

  it('validates reset fields in actionable order', () => {
    const valid = {
      code: '123456',
      confirmPassword: 'Strong!123',
      email: 'operator@example.com',
      newPassword: 'Strong!123',
    };

    assert.equal(getPasswordResetError(valid), null);
    assert.equal(
      getPasswordResetError({ ...valid, code: '12345' }),
      'Verification code must be exactly 6 digits.'
    );
    assert.equal(
      getPasswordResetError({ ...valid, newPassword: 'weak', confirmPassword: 'weak' }),
      'Use 8 or more characters with uppercase, lowercase, a number and a symbol.'
    );
    assert.equal(
      getPasswordResetError({ ...valid, confirmPassword: 'Different!123' }),
      'Passwords do not match.'
    );
  });
});
