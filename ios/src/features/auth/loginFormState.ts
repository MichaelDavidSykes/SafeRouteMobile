import { sanitizeLoginCode } from './twoFactorChallenge';

export interface LoginPrimaryActionOptions {
  challengeActive: boolean;
  challengeExpired: boolean;
  code: string;
  email: string;
  loading: boolean;
  password: string;
}

export interface LoginPrimaryActionState {
  accessibilityHint: string;
  accessibilityLabel: string;
  disabled: boolean;
  text: string;
}

export interface LoginSecondaryActionState {
  accessibilityHint: string;
  accessibilityLabel: string;
  text: string;
}

export interface LoginMapReturnActionState {
  accessibilityHint: string;
  accessibilityLabel: string;
  text: string;
}

export function getLoginPrimaryActionState({
  challengeActive,
  challengeExpired,
  code,
  email,
  loading,
  password
}: LoginPrimaryActionOptions): LoginPrimaryActionState {
  if (loading) {
    return challengeActive
      ? {
          accessibilityHint: 'Wait for LunarChain to verify the current login code.',
          accessibilityLabel: 'Verifying LunarChain login code',
          disabled: true,
          text: 'Verifying code'
        }
      : {
          accessibilityHint: 'Wait for LunarChain sign-in to finish.',
          accessibilityLabel: 'Logging in to LunarChain',
          disabled: true,
          text: 'Logging in'
        };
  }

  if (!challengeActive) {
    if (!email.trim() || !password) {
      return {
        accessibilityHint: 'Enter both email and password before signing in.',
        accessibilityLabel: 'Log in to LunarChain. Email and password required.',
        disabled: true,
        text: 'Log in'
      };
    }

    return {
      accessibilityHint: 'Signs in with your LunarChain email and password.',
      accessibilityLabel: 'Log in to LunarChain',
      disabled: false,
      text: 'Log in'
    };
  }

  if (challengeExpired) {
    return {
      accessibilityHint: 'Go back and sign in again to request a fresh code.',
      accessibilityLabel: 'LunarChain login code expired',
      disabled: true,
      text: 'Code expired'
    };
  }

  if (sanitizeLoginCode(code).length !== 6) {
    return {
      accessibilityHint: 'Enter all six digits from the LunarChain login code.',
      accessibilityLabel: 'Verify LunarChain login code. Six digits required.',
      disabled: true,
      text: 'Verify code'
    };
  }

  return {
    accessibilityHint: 'Verifies the six-digit LunarChain login code.',
    accessibilityLabel: 'Verify LunarChain login code',
    disabled: false,
    text: 'Verify code'
  };
}

export function getTwoFactorSecondaryActionState(
  challengeExpired: boolean
): LoginSecondaryActionState {
  if (challengeExpired) {
    return {
      accessibilityHint: 'Returns to email and password sign-in. Sign in again to request a fresh code.',
      accessibilityLabel: 'Return to LunarChain sign in',
      text: 'Back to sign in'
    };
  }

  return {
    accessibilityHint: 'Returns to email and password sign-in.',
    accessibilityLabel: 'Use a different LunarChain account',
    text: 'Use a different account'
  };
}

export function getLoginMapReturnActionState(): LoginMapReturnActionState {
  return {
    accessibilityHint: 'Returns to the map-first SafeRoute home without signing in.',
    accessibilityLabel: 'Continue using the SafeRoute map without signing in',
    text: 'Map'
  };
}
