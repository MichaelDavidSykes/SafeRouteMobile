import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createCompactLoginNoticeText,
  createLoginNoticeState,
  LOGIN_NOTICE_MESSAGE_MAX_LENGTH
} from '../src/features/auth/loginNoticeState';

describe('login notice state', () => {
  it('hides blank session notice copy', () => {
    assert.equal(createLoginNoticeState('   \n\t   '), null);
  });

  it('keeps concise sign-in prompts visible without duplicate accessibility copy', () => {
    assert.deepEqual(createLoginNoticeState('  Sign in to save and sync.  '), {
      accessibilityLabel: null,
      message: 'Sign in to save and sync.'
    });
  });

  it('normalizes multiline session notices before rendering them', () => {
    assert.deepEqual(
      createLoginNoticeState('Your session expired.\nSign in again to sync saved routes.'),
      {
        accessibilityLabel: null,
        message: 'Your session expired. Sign in again to sync saved routes.'
      }
    );
  });

  it('bounds verbose session notices while preserving full VoiceOver context', () => {
    const message =
      'Using your saved LunarChain session. Some SafeRoute data may need a network refresh before saved routes appear.';
    const compactMessage = `${message.slice(0, LOGIN_NOTICE_MESSAGE_MAX_LENGTH - 1).trimEnd()}…`;

    assert.deepEqual(createLoginNoticeState(message), {
      accessibilityLabel: message,
      message: compactMessage
    });
    assert.equal(compactMessage.length, LOGIN_NOTICE_MESSAGE_MAX_LENGTH);
  });

  it('uses the login notice bound for direct compact copy helpers', () => {
    const message = 'A'.repeat(LOGIN_NOTICE_MESSAGE_MAX_LENGTH + 10);

    assert.equal(
      createCompactLoginNoticeText(message),
      `${'A'.repeat(LOGIN_NOTICE_MESSAGE_MAX_LENGTH - 1)}…`
    );
  });
});
