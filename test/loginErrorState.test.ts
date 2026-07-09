import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createCompactLoginErrorText,
  createLoginErrorState,
  LOGIN_ERROR_MESSAGE_MAX_LENGTH
} from '../src/features/auth/loginErrorState';

describe('login error state', () => {
  it('hides blank login error copy', () => {
    assert.equal(createLoginErrorState('   \n\t   '), null);
  });

  it('keeps concise validation errors visible without duplicate accessibility copy', () => {
    assert.deepEqual(createLoginErrorState('  Enter your LunarChain email and password.  '), {
      accessibilityLabel: null,
      message: 'Enter your LunarChain email and password.'
    });
  });

  it('normalizes multiline hosted auth errors before rendering them', () => {
    assert.deepEqual(
      createLoginErrorState('Verification failed.\nOpen LunarChain and request a fresh code.'),
      {
        accessibilityLabel: null,
        message: 'Verification failed. Open LunarChain and request a fresh code.'
      }
    );
  });

  it('bounds verbose hosted auth errors while preserving full VoiceOver context', () => {
    const message =
      'Verification failed because this LunarChain operator account requires a fresh security review before route sync can continue.';
    const compactMessage = `${message.slice(0, LOGIN_ERROR_MESSAGE_MAX_LENGTH - 1).trimEnd()}…`;

    assert.deepEqual(createLoginErrorState(message), {
      accessibilityLabel: message,
      message: compactMessage
    });
    assert.equal(compactMessage.length, LOGIN_ERROR_MESSAGE_MAX_LENGTH);
  });

  it('uses the login error bound for direct compact copy helpers', () => {
    const message = 'A'.repeat(LOGIN_ERROR_MESSAGE_MAX_LENGTH + 10);

    assert.equal(
      createCompactLoginErrorText(message),
      `${'A'.repeat(LOGIN_ERROR_MESSAGE_MAX_LENGTH - 1)}…`
    );
  });
});
