export const OFFLINE_OPERATIONS_PREFERENCE_MAX_BYTES = 1900;
export const OFFLINE_OPERATIONS_PREFERENCE_MAX_SCOPES = 8;

const OFFLINE_OPERATIONS_PREFERENCE_SCHEMA = 1;
const MAX_SCOPE_IDENTITY_LENGTH = 256;

export type OfflineOperationsDisabledScope = {
  cleanupPending: boolean;
  principalId: string;
  workspaceId: string;
};

export type OfflineOperationsPreferenceRecord = {
  disabledScopes: OfflineOperationsDisabledScope[];
  schema: number;
};

export function parseOfflineOperationsPreferenceRecord(
  raw: string | null,
): OfflineOperationsPreferenceRecord | null {
  if (raw === null) {
    return {
      disabledScopes: [],
      schema: OFFLINE_OPERATIONS_PREFERENCE_SCHEMA,
    };
  }
  if (utf8ByteLength(raw) > OFFLINE_OPERATIONS_PREFERENCE_MAX_BYTES) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      !hasExactKeys(value, ["disabledScopes", "schema"]) ||
      value.schema !== OFFLINE_OPERATIONS_PREFERENCE_SCHEMA ||
      !Array.isArray(value.disabledScopes) ||
      value.disabledScopes.length > OFFLINE_OPERATIONS_PREFERENCE_MAX_SCOPES
    ) {
      return null;
    }

    const disabledScopes: OfflineOperationsDisabledScope[] = [];
    const seen = new Set<string>();
    for (const candidate of value.disabledScopes) {
      if (
        !isRecord(candidate) ||
        !hasExactKeys(candidate, [
          "cleanupPending",
          "principalId",
          "workspaceId",
        ]) ||
        typeof candidate.cleanupPending !== "boolean"
      ) {
        return null;
      }
      const principalId = normalizeScopeIdentity(candidate.principalId);
      const workspaceId = normalizeScopeIdentity(candidate.workspaceId);
      if (
        !principalId ||
        !workspaceId ||
        principalId !== candidate.principalId ||
        workspaceId !== candidate.workspaceId
      ) {
        return null;
      }
      const scopeKey = createOfflineOperationsPreferenceScopeKey(
        principalId,
        workspaceId,
      );
      if (!scopeKey) {
        return null;
      }
      if (seen.has(scopeKey)) {
        return null;
      }
      seen.add(scopeKey);
      disabledScopes.push({
        cleanupPending: candidate.cleanupPending,
        principalId,
        workspaceId,
      });
    }

    return {
      disabledScopes,
      schema: OFFLINE_OPERATIONS_PREFERENCE_SCHEMA,
    };
  } catch {
    return null;
  }
}

export function disableOfflineOperationsPreferenceScope(
  record: OfflineOperationsPreferenceRecord,
  principalIdValue: string,
  workspaceIdValue: string,
): OfflineOperationsPreferenceRecord | null {
  const principalId = normalizeScopeIdentity(principalIdValue);
  const workspaceId = normalizeScopeIdentity(workspaceIdValue);
  if (!principalId || !workspaceId) {
    return null;
  }
  if (
    getOfflineOperationsPreferenceScope(record, principalId, workspaceId)
  ) {
    return {
      disabledScopes: record.disabledScopes.map((scope) =>
        scope.principalId === principalId &&
        scope.workspaceId === workspaceId
          ? { ...scope, cleanupPending: true }
          : scope,
      ),
      schema: OFFLINE_OPERATIONS_PREFERENCE_SCHEMA,
    };
  }
  if (
    record.disabledScopes.length >=
    OFFLINE_OPERATIONS_PREFERENCE_MAX_SCOPES
  ) {
    return null;
  }

  const nextRecord: OfflineOperationsPreferenceRecord = {
    disabledScopes: [
      ...record.disabledScopes,
      { cleanupPending: true, principalId, workspaceId },
    ],
    schema: OFFLINE_OPERATIONS_PREFERENCE_SCHEMA,
  };
  return utf8ByteLength(JSON.stringify(nextRecord)) <=
    OFFLINE_OPERATIONS_PREFERENCE_MAX_BYTES
    ? nextRecord
    : null;
}

export function enableOfflineOperationsPreferenceScope(
  record: OfflineOperationsPreferenceRecord,
  principalIdValue: string,
  workspaceIdValue: string,
): OfflineOperationsPreferenceRecord | null {
  const principalId = normalizeScopeIdentity(principalIdValue);
  const workspaceId = normalizeScopeIdentity(workspaceIdValue);
  if (!principalId || !workspaceId) {
    return null;
  }
  return {
    disabledScopes: record.disabledScopes.filter(
      (scope) =>
        scope.principalId !== principalId ||
        scope.workspaceId !== workspaceId,
    ),
    schema: OFFLINE_OPERATIONS_PREFERENCE_SCHEMA,
  };
}

export function isOfflineOperationsPreferenceScopeDisabled(
  record: OfflineOperationsPreferenceRecord,
  principalIdValue: string,
  workspaceIdValue: string,
): boolean {
  const principalId = normalizeScopeIdentity(principalIdValue);
  const workspaceId = normalizeScopeIdentity(workspaceIdValue);
  return Boolean(
    principalId &&
      workspaceId &&
      getOfflineOperationsPreferenceScope(record, principalId, workspaceId),
  );
}

export function completeOfflineOperationsPreferenceCleanup(
  record: OfflineOperationsPreferenceRecord,
  principalIdValue: string,
  workspaceIdValue: string,
): OfflineOperationsPreferenceRecord | null {
  const principalId = normalizeScopeIdentity(principalIdValue);
  const workspaceId = normalizeScopeIdentity(workspaceIdValue);
  if (!principalId || !workspaceId) {
    return null;
  }
  const scope = getOfflineOperationsPreferenceScope(
    record,
    principalId,
    workspaceId,
  );
  if (!scope) {
    return null;
  }
  return {
    disabledScopes: record.disabledScopes.map((candidate) =>
      candidate === scope
        ? { ...candidate, cleanupPending: false }
        : candidate,
    ),
    schema: OFFLINE_OPERATIONS_PREFERENCE_SCHEMA,
  };
}

export function getOfflineOperationsPreferenceScope(
  record: OfflineOperationsPreferenceRecord,
  principalIdValue: string,
  workspaceIdValue: string,
): OfflineOperationsDisabledScope | null {
  const principalId = normalizeScopeIdentity(principalIdValue);
  const workspaceId = normalizeScopeIdentity(workspaceIdValue);
  if (!principalId || !workspaceId) {
    return null;
  }
  return (
    record.disabledScopes.find(
      (scope) =>
        scope.principalId === principalId &&
        scope.workspaceId === workspaceId,
    ) || null
  );
}

export function createOfflineOperationsPreferenceScopeKey(
  principalIdValue: string,
  workspaceIdValue: string,
): string | null {
  const principalId = normalizeScopeIdentity(principalIdValue);
  const workspaceId = normalizeScopeIdentity(workspaceIdValue);
  return principalId && workspaceId
    ? JSON.stringify([principalId, workspaceId])
    : null;
}

export function normalizeOfflineOperationsPreferenceScopeIdentity(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized &&
    normalized.length <= MAX_SCOPE_IDENTITY_LENGTH &&
    !/[\u0000-\u001f\u007f]/u.test(normalized)
    ? normalized
    : null;
}

const normalizeScopeIdentity =
  normalizeOfflineOperationsPreferenceScopeIdentity;

function utf8ByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return unescape(encodeURIComponent(value)).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpectedKeys.length &&
    actualKeys.every((key, index) => key === sortedExpectedKeys[index])
  );
}
