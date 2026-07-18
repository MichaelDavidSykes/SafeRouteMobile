import * as SecureStore from 'expo-secure-store';

import type { AuthSession } from './authTypes';
import {
  createDeviceOnlySecureStoreOptions,
  createStoredAuthSession,
  classifyStoredAuthSessionForContract,
  parseStoredAuthSession,
  serializeSignedOutAuthSession,
  serializeStoredAuthSession
} from './authStorageCore';
import { SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED } from '../../config/env';
import { shouldInjectConnectivityContractStorageFault } from '../../testing/connectivityContractStorageFault';

const AUTH_SESSION_KEY = 'saferoute_auth_session_v2';
const ACCESS_TOKEN_KEY = 'saferoute_access_token';
const EMAIL_KEY = 'saferoute_email';
const DEVICE_ONLY_SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions =
  createDeviceOnlySecureStoreOptions(SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY);

export async function saveAuthSession(session: AuthSession): Promise<void> {
  const serialized = serializeStoredAuthSession(session);
  if (!serialized) {
    throw new Error('A validated account identity is required before saving this session.');
  }
  await SecureStore.setItemAsync(AUTH_SESSION_KEY, serialized, DEVICE_ONLY_SECURE_STORE_OPTIONS);
  await Promise.allSettled([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(EMAIL_KEY)
  ]);
}

export async function loadAuthSession(): Promise<AuthSession | null> {
  const storedEnvelope = await SecureStore.getItemAsync(AUTH_SESSION_KEY);
  if (storedEnvelope !== null) {
    return parseStoredAuthSession(storedEnvelope);
  }

  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  const email = await SecureStore.getItemAsync(EMAIL_KEY);

  return createStoredAuthSession(accessToken, email);
}

export async function clearAuthSession(): Promise<void> {
  if (
    SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED &&
    await shouldInjectConnectivityContractStorageFault(
      'auth-session-tombstone-set'
    )
  ) {
    throw new Error('Contract-injected auth storage failure');
  }
  await SecureStore.setItemAsync(
    AUTH_SESSION_KEY,
    serializeSignedOutAuthSession(),
    DEVICE_ONLY_SECURE_STORE_OPTIONS
  );
  await Promise.allSettled([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(EMAIL_KEY)
  ]);
}

export async function readAuthSessionContractState(): Promise<
  'present' | 'signed-out' | 'unavailable' | 'unknown'
> {
  try {
    const storedEnvelope = await SecureStore.getItemAsync(AUTH_SESSION_KEY);
    if (storedEnvelope !== null) {
      return classifyStoredAuthSessionForContract(storedEnvelope);
    }
    const legacyAccessToken =
      await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
    return legacyAccessToken ? 'present' : 'signed-out';
  } catch {
    return 'unavailable';
  }
}
