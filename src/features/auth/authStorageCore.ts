import type { AuthSession } from './authTypes';

export function createStoredAuthSession(
  accessTokenValue: string | null,
  emailValue: string | null
): AuthSession | null {
  const accessToken = String(accessTokenValue || '').trim();

  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    email: String(emailValue || '').trim()
  };
}
