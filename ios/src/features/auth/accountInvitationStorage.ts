import * as SecureStore from 'expo-secure-store';

import { createDeviceOnlySecureStoreOptions } from './authStorageCore';
import {
  parseAccountInvitationToken,
  serializeAccountInvitationToken,
} from './accountInvitationStorageCore';

const PENDING_INVITATION_KEY = 'saferoute_pending_invitation_v1';
const DEVICE_ONLY_SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions =
  createDeviceOnlySecureStoreOptions(SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY);

export async function savePendingAccountInvitationToken(token: string): Promise<void> {
  const serialized = serializeAccountInvitationToken(token);
  if (!serialized) {
    throw new Error('A valid invitation is required before secure storage.');
  }
  await SecureStore.setItemAsync(
    PENDING_INVITATION_KEY,
    serialized,
    DEVICE_ONLY_SECURE_STORE_OPTIONS
  );
}

export async function loadPendingAccountInvitationToken(): Promise<string> {
  const storedValue = await SecureStore.getItemAsync(PENDING_INVITATION_KEY);
  const token = parseAccountInvitationToken(storedValue);
  if (!token && storedValue !== null) {
    await SecureStore.deleteItemAsync(PENDING_INVITATION_KEY);
  }
  return token;
}

export async function clearPendingAccountInvitationToken(): Promise<void> {
  await SecureStore.deleteItemAsync(PENDING_INVITATION_KEY);
}
