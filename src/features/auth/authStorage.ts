import * as SecureStore from 'expo-secure-store';

import type { AuthSession } from './authTypes';
import { createStoredAuthSession } from './authStorageCore';

const ACCESS_TOKEN_KEY = 'saferoute_access_token';
const EMAIL_KEY = 'saferoute_email';

export async function saveAuthSession(session: AuthSession): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken);
  await SecureStore.setItemAsync(EMAIL_KEY, session.email);
}

export async function loadAuthSession(): Promise<AuthSession | null> {
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  const email = await SecureStore.getItemAsync(EMAIL_KEY);

  return createStoredAuthSession(accessToken, email);
}

export async function clearAuthSession(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(EMAIL_KEY);
}
