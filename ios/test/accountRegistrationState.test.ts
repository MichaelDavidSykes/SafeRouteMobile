import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getAccountPasswordRequirements,
  getAccountRegistrationError,
  getAccountVerificationError,
  isValidAccountEmail,
} from '../src/features/auth/accountRegistrationState';

describe('account registration state', () => {
  it('matches the three password checks in the SafeRoute handoff', () => {
    assert.deepEqual(getAccountPasswordRequirements(''), {
      length: false,
      letterAndNumber: false,
      special: false,
    });
    assert.deepEqual(getAccountPasswordRequirements('RouteSafe!42'), {
      length: true,
      letterAndNumber: true,
      special: true,
    });
  });

  it('requires names, normalized email, and every password rule', () => {
    assert.equal(
      getAccountRegistrationError({
        email: 'operator@example.com',
        firstName: '',
        lastName: 'Driver',
        password: 'RouteSafe!42',
      }),
      'Enter your first and last name.'
    );
    assert.equal(isValidAccountEmail(' Operator@Example.COM '), true);
    assert.equal(isValidAccountEmail('operator'), false);
    assert.equal(
      getAccountRegistrationError({
        email: 'operator@example.com',
        firstName: 'Safe',
        lastName: 'Driver',
        password: 'RouteSafe!42',
      }),
      ''
    );
  });

  it('accepts only a clean six-digit verification code', () => {
    assert.equal(getAccountVerificationError('12 34-56'), '');
    assert.equal(
      getAccountVerificationError('12345'),
      'Enter the 6-digit code from your verification email.'
    );
  });
});
