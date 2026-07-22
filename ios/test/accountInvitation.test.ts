import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createAccountInvitation,
  extractInvitationTokenFromUrl,
} from '../src/features/auth/accountInvitation';

describe('account invitation links', () => {
  it('reads invitation capabilities from trusted LunarChain universal links', () => {
    assert.equal(
      extractInvitationTokenFromUrl(
        'https://app.lunarchain.net/register#invite_token=secure-token-123'
      ),
      'secure-token-123'
    );
    assert.equal(
      extractInvitationTokenFromUrl(
        'https://app.lunarchain.net/login?invite_token=secure-token-456'
      ),
      'secure-token-456'
    );
  });

  it('reads trusted SafeRoute scheme links without accepting arbitrary origins', () => {
    assert.equal(
      extractInvitationTokenFromUrl(
        'saferoute://register?invite_token=secure-token-789'
      ),
      'secure-token-789'
    );
    assert.equal(
      extractInvitationTokenFromUrl(
        'https://attacker.example/register?invite_token=secure-token-789'
      ),
      ''
    );
    assert.equal(
      extractInvitationTokenFromUrl(
        'saferoute://untrusted?invite_token=secure-token-789'
      ),
      ''
    );
  });

  it('rejects malformed or implausible invitation values', () => {
    assert.equal(extractInvitationTokenFromUrl('not a URL'), '');
    assert.equal(
      extractInvitationTokenFromUrl(
        'https://app.lunarchain.net/register#invite_token=short'
      ),
      ''
    );
  });

  it('normalizes resolved invitation metadata', () => {
    assert.deepEqual(
      createAccountInvitation(' secure-token-123 ', {
        client_id: ' client-123 ',
        client_name: ' Operations ',
        email: ' Invitee@Example.com ',
        has_account: false,
      }),
      {
        clientId: 'client-123',
        clientName: 'Operations',
        email: 'invitee@example.com',
        hasAccount: false,
        token: 'secure-token-123',
      }
    );
  });
});
