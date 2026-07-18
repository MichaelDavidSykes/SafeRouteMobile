import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import {
  OFFLINE_OPERATIONS_CACHE_MAX_BYTES,
  createOfflineOperationsCacheRecord,
  createOfflineOperationsRevocationRecord,
  parseOfflineOperationsCacheRecord,
  utf8ByteLength,
  type OfflineOperationsSnapshot,
} from "./offlineOperationsCacheCore";
import type { SafeRouteOperationsState } from "./operationsTypes";

export type OfflineOperationsStorageAdapter = {
  get: () => Promise<string | null>;
  remove: () => Promise<void>;
  set: (value: string) => Promise<void>;
};

export async function tryActivateOfflineOperationsScope(
  activate: () => Promise<void>,
): Promise<boolean> {
  try {
    await activate();
    return true;
  } catch {
    return false;
  }
}

export function createOfflineOperationsStorage(
  adapter: OfflineOperationsStorageAdapter,
) {
  let pendingMutation = Promise.resolve();
  const revokedPrincipals = new Set<string>();
  const revokedWorkspaces = new Set<string>();
  const principalRevocationEpochs = new Map<string, number>();
  const workspaceRevocationEpochs = new Map<string, number>();
  let revocationEpoch = 0;

  const workspaceRevocationKey = (
    principalId: string,
    workspaceId: string,
  ) => `${principalId.trim()}\u0000${workspaceId.trim()}`;

  const enqueue = async (mutation: () => Promise<void>): Promise<void> => {
    const currentMutation = pendingMutation
      .catch(() => undefined)
      .then(mutation);
    pendingMutation = currentMutation;
    await currentMutation;
  };

  const revoke = async (
    principalId: string,
    workspaceId: string | null,
    expectedRaw?: string,
  ): Promise<void> => {
    const record = createOfflineOperationsRevocationRecord(
      principalId,
      workspaceId,
    );
    if (!record) {
      return;
    }
    const serialized = JSON.stringify(record);
    await enqueue(async () => {
      if (workspaceId !== null) {
        const current = await adapter.get();
        if (expectedRaw !== undefined && current !== expectedRaw) {
          return;
        }
        if (!storedRecordMatchesScope(current, principalId, workspaceId)) {
          return;
        }
      }

      let writeFailed = false;
      try {
        await adapter.set(serialized);
      } catch {
        writeFailed = true;
      }
      if (!writeFailed) {
        if ((await adapter.get()) === serialized) {
          return;
        }
        throw new Error("Offline Operations revocation could not be verified");
      }

      // The process-local fence still blocks late saves after a storage write
      // failure. Remove any existing sensitive value as the fail-closed fallback.
      await adapter.remove();
      if ((await adapter.get()) !== null) {
        throw new Error("Offline Operations calendar could not be revoked");
      }
    });
  };

  return {
    async activatePrincipal(principalId: string): Promise<void> {
      const normalizedPrincipalId = principalId.trim();
      if (!normalizedPrincipalId) {
        return;
      }
      const activationEpoch =
        principalRevocationEpochs.get(normalizedPrincipalId);
      await enqueue(async () => {
        const current = await adapter.get();
        if (
          isPrincipalRevocation(current, normalizedPrincipalId) ||
          (revokedPrincipals.has(normalizedPrincipalId) &&
            storedRecordMatchesScope(current, normalizedPrincipalId, null))
        ) {
          await adapter.remove();
          if ((await adapter.get()) !== null) {
            throw new Error("Offline Operations principal could not be activated");
          }
        }
        if (
          principalRevocationEpochs.get(normalizedPrincipalId) ===
          activationEpoch
        ) {
          revokedPrincipals.delete(normalizedPrincipalId);
          principalRevocationEpochs.delete(normalizedPrincipalId);
        }
      });
    },

    async clearPrincipal(principalId: string): Promise<void> {
      const normalizedPrincipalId = principalId.trim();
      if (!normalizedPrincipalId) {
        return;
      }
      revokedPrincipals.add(normalizedPrincipalId);
      principalRevocationEpochs.set(
        normalizedPrincipalId,
        ++revocationEpoch,
      );
      await revoke(normalizedPrincipalId, null);
    },

    async activateWorkspace(
      principalId: string,
      workspaceId: string,
    ): Promise<void> {
      const normalizedPrincipalId = principalId.trim();
      const normalizedWorkspaceId = workspaceId.trim();
      if (!normalizedPrincipalId || !normalizedWorkspaceId) {
        return;
      }
      const revocationKey = workspaceRevocationKey(
        normalizedPrincipalId,
        normalizedWorkspaceId,
      );
      const activationEpoch = workspaceRevocationEpochs.get(revocationKey);
      await enqueue(async () => {
        const current = await adapter.get();
        if (
          isWorkspaceRevocation(
            current,
            normalizedPrincipalId,
            normalizedWorkspaceId,
          ) ||
          (revokedWorkspaces.has(revocationKey) &&
            storedRecordMatchesScope(
              current,
              normalizedPrincipalId,
              normalizedWorkspaceId,
            ))
        ) {
          await adapter.remove();
          if ((await adapter.get()) !== null) {
            throw new Error("Offline Operations workspace could not be activated");
          }
        }
        if (
          workspaceRevocationEpochs.get(revocationKey) === activationEpoch
        ) {
          revokedWorkspaces.delete(revocationKey);
          workspaceRevocationEpochs.delete(revocationKey);
        }
      });
    },

    async clearWorkspace(
      principalId: string,
      workspaceId: string,
    ): Promise<void> {
      const normalizedPrincipalId = principalId.trim();
      const normalizedWorkspaceId = workspaceId.trim();
      if (!normalizedPrincipalId || !normalizedWorkspaceId) {
        return;
      }
      const revocationKey = workspaceRevocationKey(
        normalizedPrincipalId,
        normalizedWorkspaceId,
      );
      revokedWorkspaces.add(revocationKey);
      workspaceRevocationEpochs.set(revocationKey, ++revocationEpoch);
      await revoke(normalizedPrincipalId, normalizedWorkspaceId);
    },

    async load(
      principalId: string,
      workspaceId: string,
      nowMs = Date.now(),
    ): Promise<OfflineOperationsSnapshot | null> {
      if (!principalId.trim() || !workspaceId.trim()) {
        return null;
      }
      await pendingMutation.catch(() => undefined);
      if (
        revokedPrincipals.has(principalId.trim()) ||
        revokedWorkspaces.has(workspaceRevocationKey(principalId, workspaceId))
      ) {
        return null;
      }
      try {
        const raw = await adapter.get();
        if (
          revokedPrincipals.has(principalId.trim()) ||
          revokedWorkspaces.has(
            workspaceRevocationKey(principalId, workspaceId),
          )
        ) {
          return null;
        }
        const snapshot =
          raw &&
          utf8ByteLength(raw) <= OFFLINE_OPERATIONS_CACHE_MAX_BYTES
          ? parseOfflineOperationsCacheRecord(
              JSON.parse(raw),
              principalId,
              workspaceId,
              nowMs,
            )
          : null;
        if (
          raw !== null &&
          snapshot === null &&
          storedRecordMatchesScope(raw, principalId, workspaceId)
        ) {
          await revoke(principalId, workspaceId, raw);
        }
        return snapshot;
      } catch {
        return null;
      }
    },

    async save(
      principalId: string,
      workspaceId: string,
      value: {
        operationsState: SafeRouteOperationsState;
        routes: SavedSafeRoutePlan[];
      },
      nowMs = Date.now(),
    ): Promise<OfflineOperationsSnapshot | null> {
      const record = createOfflineOperationsCacheRecord(
        principalId,
        workspaceId,
        value,
        nowMs,
      );
      if (!record) {
        return null;
      }
      const snapshot = parseOfflineOperationsCacheRecord(
        record,
        principalId,
        workspaceId,
        record.storedAtMs,
      );
      if (!snapshot) {
        return null;
      }

      let persisted = false;
      try {
        await enqueue(async () => {
          const current = await adapter.get();
          if (
            revokedPrincipals.has(principalId.trim()) ||
            revokedWorkspaces.has(
              workspaceRevocationKey(principalId, workspaceId),
            ) ||
            isPrincipalRevocation(current, principalId) ||
            isWorkspaceRevocation(current, principalId, workspaceId)
          ) {
            return;
          }
          const serialized = JSON.stringify(record);
          await adapter.set(serialized);
          if ((await adapter.get()) !== serialized) {
            throw new Error(
              "Offline Operations calendar save could not be verified",
            );
          }
          persisted = true;
        });
        return persisted ? snapshot : null;
      } catch {
        return null;
      }
    },
  };
}

export function storedRecordMatchesScope(
  raw: string | null,
  principalId: string,
  workspaceId: string | null,
): boolean {
  if (raw === null) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as {
      principalId?: unknown;
      workspaceId?: unknown;
    };
    return (
      parsed.principalId === principalId.trim() &&
      (workspaceId === null || parsed.workspaceId === workspaceId.trim())
    );
  } catch {
    return workspaceId === null;
  }
}

export function isPrincipalRevocation(
  raw: string | null,
  principalId: string,
): boolean {
  if (raw === null) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as {
      principalId?: unknown;
      revoked?: unknown;
      workspaceId?: unknown;
    };
    return (
      parsed.principalId === principalId.trim() &&
      parsed.revoked === true &&
      parsed.workspaceId === null
    );
  } catch {
    return true;
  }
}

export function isWorkspaceRevocation(
  raw: string | null,
  principalId: string,
  workspaceId: string,
): boolean {
  if (raw === null) {
    return false;
  }
  try {
    const parsed = JSON.parse(raw) as {
      principalId?: unknown;
      revoked?: unknown;
      workspaceId?: unknown;
    };
    return (
      parsed.principalId === principalId.trim() &&
      parsed.revoked === true &&
      parsed.workspaceId === workspaceId.trim()
    );
  } catch {
    return true;
  }
}
