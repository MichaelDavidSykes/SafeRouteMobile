import * as SecureStore from 'expo-secure-store';

import type { AuthSession } from './authTypes';
import {
  createDeviceOnlySecureStoreOptions,
  createStoredAuthSession,
  classifyStoredAuthSessionForContract,
  hasSameAuthSessionSnapshot,
  parseStoredAuthSession,
  serializeSignedOutAuthSession,
  serializeStoredAuthSession,
  serializeStoredAuthSessionRequiringOnlineValidation
} from './authStorageCore';
import { SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED } from '../../config/env';
import { shouldInjectConnectivityContractStorageFault } from '../../testing/connectivityContractStorageFault';

const AUTH_SESSION_KEY = 'saferoute_auth_session_v2';
const ACCESS_TOKEN_KEY = 'saferoute_access_token';
const EMAIL_KEY = 'saferoute_email';
const DEVICE_ONLY_SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions =
  createDeviceOnlySecureStoreOptions(SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY);
let authStorageMutationTail: Promise<void> = Promise.resolve();

export async function saveAuthSession(session: AuthSession): Promise<void> {
  const serialized = serializeStoredAuthSession(session);
  if (!serialized) {
    throw new Error('A validated account identity is required before saving this session.');
  }
  await runAuthStorageMutation(async () => {
    await persistAuthSessionEnvelope(serialized);
  });
}

export async function saveAuthSessionIfCurrent(
  expectedSession: AuthSession,
  nextSession: AuthSession,
): Promise<'persisted' | 'stale'> {
  const serialized = serializeStoredAuthSession(nextSession);
  if (!serialized) {
    throw new Error('A validated account identity is required before saving this session.');
  }
  return runAuthStorageMutation(async () => {
    const currentSession = await readAuthSession();
    if (!hasSameAuthSessionSnapshot(currentSession, expectedSession)) {
      return 'stale';
    }
    await persistAuthSessionEnvelope(serialized);
    return 'persisted';
  });
}

export async function loadAuthSession(): Promise<AuthSession | null> {
  return readAuthSession();
}

async function readAuthSession(): Promise<AuthSession | null> {
  const storedEnvelope = await SecureStore.getItemAsync(AUTH_SESSION_KEY);
  if (storedEnvelope !== null) {
    return parseStoredAuthSession(storedEnvelope);
  }

  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  const email = await SecureStore.getItemAsync(EMAIL_KEY);

  return createStoredAuthSession(accessToken, email);
}

export async function requireOnlineAuthSessionValidation(
  session: AuthSession
): Promise<'persisted' | 'stale'> {
  const serialized =
    serializeStoredAuthSessionRequiringOnlineValidation(session);
  if (!serialized) {
    throw new Error(
      'A stable account identity is required before quarantining this session.',
    );
  }
  return runAuthStorageMutation(async () => {
    const currentSession = await readAuthSession();
    if (!hasSameAuthSessionSnapshot(currentSession, session)) {
      return 'stale';
    }
    await persistAuthSessionEnvelope(serialized);
    return 'persisted';
  });
}

export async function clearAuthSession(): Promise<void> {
  await runAuthStorageMutation(writeSignedOutAuthSession);
}

export async function clearAuthSessionIfCurrent(
  session: AuthSession
): Promise<'cleared' | 'stale'> {
  return runAuthStorageMutation(async () => {
    const currentSession = await readAuthSession();
    if (!hasSameAuthSessionSnapshot(currentSession, session)) {
      return 'stale';
    }
    await writeSignedOutAuthSession();
    return 'cleared';
  });
}

async function writeSignedOutAuthSession(): Promise<void> {
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

async function persistAuthSessionEnvelope(serialized: string): Promise<void> {
  await SecureStore.setItemAsync(
    AUTH_SESSION_KEY,
    serialized,
    DEVICE_ONLY_SECURE_STORE_OPTIONS,
  );
  await Promise.allSettled([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(EMAIL_KEY),
  ]);
}

function runAuthStorageMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = authStorageMutationTail.then(operation, operation);
  authStorageMutationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
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
