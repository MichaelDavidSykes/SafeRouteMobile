import type { AuthSession } from './authTypes';

export type AuthSecureStoreOptions = {
  keychainAccessible?: number;
};

export function createDeviceOnlySecureStoreOptions(
  deviceOnlyAccessibility: unknown
): AuthSecureStoreOptions {
  return typeof deviceOnlyAccessibility === 'number' && Number.isFinite(deviceOnlyAccessibility)
    ? { keychainAccessible: deviceOnlyAccessibility }
    : {};
}

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
