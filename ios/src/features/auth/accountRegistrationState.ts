import { normalizeEmail } from './authPayload';
import { sanitizeLoginCode } from './twoFactorChallenge';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SPECIAL_CHARACTER_PATTERN = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/;

export interface AccountRegistrationValues {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

export interface AccountPasswordRequirements {
  length: boolean;
  letterAndNumber: boolean;
  special: boolean;
}

export function getAccountPasswordRequirements(
  password: string
): AccountPasswordRequirements {
  return {
    length: password.length >= 8,
    letterAndNumber: /[A-Za-z]/.test(password) && /\d/.test(password),
    special: SPECIAL_CHARACTER_PATTERN.test(password),
  };
}

export function isValidAccountEmail(email: string): boolean {
  return EMAIL_PATTERN.test(normalizeEmail(email));
}

export function getAccountRegistrationError({
  email,
  firstName,
  lastName,
  password,
}: AccountRegistrationValues): string {
  if (!firstName.trim() || !lastName.trim()) {
    return 'Enter your first and last name.';
  }

  if (!isValidAccountEmail(email)) {
    return 'Enter a valid email address.';
  }

  const requirements = getAccountPasswordRequirements(password);
  if (!requirements.length || !requirements.letterAndNumber || !requirements.special) {
    return 'Choose a password that meets all three requirements.';
  }

  return '';
}

export function getAccountVerificationError(code: string): string {
  return sanitizeLoginCode(code).length === 6
    ? ''
    : 'Enter the 6-digit code from your verification email.';
}
