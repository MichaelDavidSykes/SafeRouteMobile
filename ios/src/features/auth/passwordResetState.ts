import { normalizeEmail } from './authPayload';
import { sanitizeLoginCode } from './twoFactorChallenge';

export interface PasswordResetInput {
  code: string;
  confirmPassword: string;
  email: string;
  newPassword: string;
}

export const PASSWORD_RESET_CONNECTION_MESSAGE =
  'Unable to reach LunarChain. Check your connection and try again.';

export function getPasswordResetRequestError(email: string): string | null {
  return isValidEmail(email) ? null : 'Enter a valid email address.';
}

export function getPasswordResetError({
  code,
  confirmPassword,
  email,
  newPassword,
}: PasswordResetInput): string | null {
  if (!isValidEmail(email)) {
    return 'Enter a valid email address.';
  }

  if (sanitizeLoginCode(code).length !== 6) {
    return 'Verification code must be exactly 6 digits.';
  }

  if (!isStrongPassword(newPassword)) {
    return 'Use 8 or more characters with uppercase, lowercase, a number and a symbol.';
  }

  if (newPassword !== confirmPassword) {
    return 'Passwords do not match.';
  }

  return null;
}

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[!@#$%^&*(),.?":{}|<>]/.test(password)
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}
