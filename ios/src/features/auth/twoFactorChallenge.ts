import type { TwoFactorChallenge } from './authTypes';

const LOGIN_CODE_LENGTH = 6;

export interface TwoFactorChallengeState {
  expired: boolean;
  helperText: string;
  tone: 'neutral' | 'danger';
}

export function sanitizeLoginCode(value: string): string {
  return String(value || '').replace(/\D/g, '').slice(0, LOGIN_CODE_LENGTH);
}

export function isTwoFactorChallengeExpired(expiresAt?: string, nowMs = Date.now()): boolean {
  if (!expiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

export function getTwoFactorSubtitle(challenge: TwoFactorChallenge, nowMs = Date.now()): string {
  if (isTwoFactorChallengeExpired(challenge.expiresAt, nowMs)) {
    return 'Request a fresh code to continue.';
  }

  const method = formatChallengeMethod(challenge.method);
  if (method === 'email' && challenge.email.trim()) {
    return `We sent a 6-digit code to ${challenge.email.trim()}. Enter it to finish signing in.`;
  }

  return method === 'verification'
    ? 'Enter the 6-digit verification code to finish signing in.'
    : `Enter the 6-digit code from your ${method} to finish signing in.`;
}

export function getTwoFactorExpiryDelayMs(expiresAt?: string, nowMs = Date.now()): number | null {
  if (!expiresAt) {
    return null;
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return null;
  }

  return Math.max(0, expiresAtMs - nowMs);
}

export function getTwoFactorRefreshDelayMs(
  expiresAt?: string,
  nowMs = Date.now(),
): number | null {
  const expiryDelayMs = getTwoFactorExpiryDelayMs(expiresAt, nowMs);
  if (expiryDelayMs === null || expiryDelayMs === 0) {
    return expiryDelayMs;
  }

  const minutesRemaining = Math.ceil(expiryDelayMs / 60000);
  const nextMinuteBoundaryMs =
    expiryDelayMs - (minutesRemaining - 1) * 60000;
  return nextMinuteBoundaryMs + 50;
}

export function getTwoFactorChallengeState(challenge: TwoFactorChallenge, now = new Date()): TwoFactorChallengeState {
  const expiryDelayMs = getTwoFactorExpiryDelayMs(challenge.expiresAt, now.getTime());

  if (expiryDelayMs === null) {
    return {
      expired: false,
      helperText: 'Use the most recent code.',
      tone: 'neutral'
    };
  }

  if (expiryDelayMs === 0) {
    return {
      expired: true,
      helperText: 'This code expired.',
      tone: 'danger'
    };
  }

  const minutesRemaining = Math.max(1, Math.ceil(expiryDelayMs / 60000));

  return {
    expired: false,
    helperText: `Expires in ${minutesRemaining} min.`,
    tone: 'neutral'
  };
}

function formatChallengeMethod(method?: string): string {
  const normalizedMethod = String(method || '').trim().replace(/[-_]/g, ' ');
  if (!normalizedMethod) {
    return 'verification';
  }

  if (/email/i.test(normalizedMethod)) {
    return 'email';
  }

  if (/sms|text/i.test(normalizedMethod)) {
    return 'text';
  }

  if (/authenticator|totp/i.test(normalizedMethod)) {
    return 'authenticator app';
  }

  return normalizedMethod;
}
