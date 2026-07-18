import type { AuthSession } from './authTypes';

export type AuthSecureStoreOptions = {
  keychainAccessible?: number;
};

const STORED_AUTH_SESSION_SCHEMA = 2;

type StoredAuthSessionEnvelope = {
  schema: typeof STORED_AUTH_SESSION_SCHEMA;
  session: {
    accessToken: string;
    email: string;
    principalId: string;
  };
};

type SignedOutAuthSessionEnvelope = {
  schema: typeof STORED_AUTH_SESSION_SCHEMA;
  signedOut: true;
};

export type StoredAuthSessionContractState =
  | 'present'
  | 'signed-out'
  | 'unknown';

export function createDeviceOnlySecureStoreOptions(
  deviceOnlyAccessibility: unknown
): AuthSecureStoreOptions {
  return typeof deviceOnlyAccessibility === 'number' && Number.isFinite(deviceOnlyAccessibility)
    ? { keychainAccessible: deviceOnlyAccessibility }
    : {};
}

export function createStoredAuthSession(
  accessTokenValue: string | null,
  emailValue: string | null,
  principalIdValue?: string | null
): AuthSession | null {
  const accessToken = String(accessTokenValue || '').trim();

  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    email: String(emailValue || '').trim(),
    ...(String(principalIdValue || '').trim()
      ? { principalId: String(principalIdValue || '').trim() }
      : {})
  };
}

export function serializeStoredAuthSession(session: AuthSession): string | null {
  const normalized = createStoredAuthSession(
    session.accessToken,
    session.user?.email || session.email,
    session.user?.id || session.principalId
  );
  if (!normalized?.principalId) {
    return null;
  }

  const envelope: StoredAuthSessionEnvelope = {
    schema: STORED_AUTH_SESSION_SCHEMA,
    session: {
      accessToken: normalized.accessToken,
      email: normalized.email,
      principalId: normalized.principalId
    }
  };
  return JSON.stringify(envelope);
}

export function serializeSignedOutAuthSession(): string {
  const envelope: SignedOutAuthSessionEnvelope = {
    schema: STORED_AUTH_SESSION_SCHEMA,
    signedOut: true
  };
  return JSON.stringify(envelope);
}

export function parseStoredAuthSession(value: unknown): AuthSession | null {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const envelope = parsed as Partial<StoredAuthSessionEnvelope>;
    if (
      envelope.schema !== STORED_AUTH_SESSION_SCHEMA ||
      !envelope.session ||
      typeof envelope.session !== 'object'
    ) {
      return null;
    }

    const session = createStoredAuthSession(
      envelope.session.accessToken,
      envelope.session.email,
      envelope.session.principalId
    );
    return session?.principalId ? session : null;
  } catch {
    return null;
  }
}

export function classifyStoredAuthSessionForContract(
  value: unknown
): StoredAuthSessionContractState {
  if (parseStoredAuthSession(value)) {
    return 'present';
  }
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).sort().join('|') === 'schema|signedOut' &&
      (parsed as Partial<SignedOutAuthSessionEnvelope>).schema ===
        STORED_AUTH_SESSION_SCHEMA &&
      (parsed as Partial<SignedOutAuthSessionEnvelope>).signedOut === true
    ) {
      return 'signed-out';
    }
  } catch {
    // A redacted contract readback reports only that the envelope is unknown.
  }
  return 'unknown';
}
