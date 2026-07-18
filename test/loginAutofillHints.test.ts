import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { resolveLoginPasswordAutofillHints } from '../src/features/auth/loginAutofillHints';

const loginSource = readFileSync(
  join(process.cwd(), 'src/features/auth/LoginScreen.tsx'),
  'utf8'
);

function textInputBlock(accessibilityLabel: string): string {
  const labelIndex = loginSource.indexOf(`accessibilityLabel="${accessibilityLabel}"`);
  assert.notEqual(labelIndex, -1, `Expected ${accessibilityLabel} input to exist`);

  const blockStart = loginSource.lastIndexOf('<TextInput', labelIndex);
  const blockEnd = loginSource.indexOf('/>', labelIndex);
  assert.notEqual(blockStart, -1, `Expected ${accessibilityLabel} TextInput start`);
  assert.notEqual(blockEnd, -1, `Expected ${accessibilityLabel} TextInput end`);

  return loginSource.slice(blockStart, blockEnd + 2);
}

describe('login autofill hints', () => {
  it('marks the LunarChain email as the credential username while keeping the email keyboard', () => {
    const emailInput = textInputBlock('LunarChain email');

    assert.match(emailInput, /autoComplete="username"/);
    assert.match(emailInput, /keyboardType="email-address"/);
    assert.match(emailInput, /returnKeyType="next"/);
    assert.match(emailInput, /textContentType="username"/);
  });

  it('marks the password field with environment-aware autofill hints and keyboard submit', () => {
    const passwordInput = textInputBlock('LunarChain password');

    assert.match(passwordInput, /\{\.\.\.passwordAutofillHints\}/);
    assert.match(passwordInput, /returnKeyType="go"/);
    assert.match(
      passwordInput,
      /secureTextEntry=\{\s*!passwordVisible && !SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED\s*\}/,
    );
    assert.match(passwordInput, /onSubmitEditing=\{submitCredentials\}/);
  });

  it('preserves production autofill while suppressing system credential UI in the exact-source contract', () => {
    assert.deepEqual(resolveLoginPasswordAutofillHints(false), {
      autoComplete: 'current-password',
      textContentType: 'password'
    });
    assert.deepEqual(resolveLoginPasswordAutofillHints(true), {
      autoComplete: 'off',
      textContentType: 'none'
    });
  });

  it('keeps one-time-code autofill while preserving formatted code paste support', () => {
    const codeInput = textInputBlock('LunarChain login code');

    assert.match(codeInput, /autoComplete="one-time-code"/);
    assert.match(codeInput, /keyboardType="number-pad"/);
    assert.match(codeInput, /returnKeyType="done"/);
    assert.match(codeInput, /textContentType="oneTimeCode"/);
    assert.match(codeInput, /onSubmitEditing=\{submitCode\}/);
    assert.match(codeInput, /sanitizeLoginCode\(value\)/);
    assert.doesNotMatch(codeInput, /maxLength=\{6\}/);
  });
});
