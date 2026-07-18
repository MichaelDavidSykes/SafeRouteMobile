import {
  completeOfflineOperationsPreferenceCleanup,
  createOfflineOperationsPreferenceScopeKey,
  disableOfflineOperationsPreferenceScope,
  enableOfflineOperationsPreferenceScope,
  getOfflineOperationsPreferenceScope,
  parseOfflineOperationsPreferenceRecord,
} from "./offlineOperationsPreferenceCore";

export type OfflineOperationsPreferenceStorageAdapter = {
  get: () => Promise<string | null>;
  remove: () => Promise<void>;
  set: (value: string) => Promise<void>;
};

export type OfflineOperationsSavingPreference =
  | "cleanup-pending"
  | "disabled"
  | "enabled"
  | "unavailable"
  | "unverified";

export type OfflineOperationsGuardedResult<T> =
  | { status: "completed"; value: T }
  | {
      status: "cleanup-pending" | "disabled" | "unavailable";
      value: null;
    };

export class OfflineOperationsPreferenceCapacityError extends Error {}

const cleanupRecoveries = new WeakMap<
  object,
  Map<string, Promise<OfflineOperationsSavingPreference>>
>();

export async function recoverOfflineOperationsPreferenceCleanup(
  storage: {
    completeCleanup: (
      principalId: string,
      workspaceId: string,
    ) => Promise<void>;
    getPreference: (
      principalId: string,
      workspaceId: string,
    ) => Promise<OfflineOperationsSavingPreference>;
  },
  principalId: string,
  workspaceId: string,
  clearSavedCalendar: () => Promise<void>,
): Promise<OfflineOperationsSavingPreference> {
  const scopeKey = createOfflineOperationsPreferenceScopeKey(
    principalId,
    workspaceId,
  );
  if (!scopeKey) {
    return "unavailable";
  }
  let recoveries = cleanupRecoveries.get(storage);
  if (!recoveries) {
    recoveries = new Map();
    cleanupRecoveries.set(storage, recoveries);
  }
  const existing = recoveries.get(scopeKey);
  if (existing) {
    return existing;
  }
  const recovery = (async () => {
    const preference = await storage.getPreference(principalId, workspaceId);
    if (preference !== "cleanup-pending") {
      return preference;
    }
    try {
      await clearSavedCalendar();
      await storage.completeCleanup(principalId, workspaceId);
      return "disabled";
    } catch {
      const current = await storage.getPreference(principalId, workspaceId);
      return current === "cleanup-pending" ? "cleanup-pending" : current;
    }
  })();
  recoveries.set(scopeKey, recovery);
  try {
    return await recovery;
  } finally {
    if (recoveries.get(scopeKey) === recovery) {
      recoveries.delete(scopeKey);
    }
  }
}

export function createOfflineOperationsPreferenceStorage(
  adapter: OfflineOperationsPreferenceStorageAdapter,
) {
  let pendingMutation = Promise.resolve();
  const processScopeStates = new Map<
    string,
    "cleanup-pending" | "disabled" | "unverified"
  >();

  const enqueue = async <T>(operation: () => Promise<T>): Promise<T> => {
    const current = pendingMutation
      .catch(() => undefined)
      .then(operation);
    pendingMutation = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  };

  const readRecord = async () => {
    const raw = await adapter.get();
    const record = parseOfflineOperationsPreferenceRecord(raw);
    if (!record) {
      throw new Error("Offline Operations saving preference is invalid");
    }
    return { raw, record };
  };
  const processGuardStatus = (
    scopeKey: string,
  ): "cleanup-pending" | "disabled" | "unavailable" | null => {
    const state = processScopeStates.get(scopeKey);
    return state === "unverified" ? "unavailable" : state || null;
  };

  return {
    async getPreference(
      principalId: string,
      workspaceId: string,
    ): Promise<OfflineOperationsSavingPreference> {
      const scopeKey = createOfflineOperationsPreferenceScopeKey(
        principalId,
        workspaceId,
      );
      if (!scopeKey) {
        return "unavailable";
      }
      const processState = processScopeStates.get(scopeKey);
      if (processState) {
        return processState;
      }
      try {
        return await enqueue(async () => {
          const queuedProcessState = processScopeStates.get(scopeKey);
          if (queuedProcessState) {
            return queuedProcessState;
          }
          const { record } = await readRecord();
          const scope = getOfflineOperationsPreferenceScope(
            record,
            principalId,
            workspaceId,
          );
          if (!scope) {
            return "enabled";
          }
          const state = scope.cleanupPending
            ? "cleanup-pending"
            : "disabled";
          processScopeStates.set(scopeKey, state);
          return state;
        });
      } catch {
        return "unavailable";
      }
    },

    async disable(
      principalId: string,
      workspaceId: string,
    ): Promise<void> {
      const scopeKey = createOfflineOperationsPreferenceScopeKey(
        principalId,
        workspaceId,
      );
      if (!scopeKey) {
        throw new Error("Offline Operations saving scope is invalid");
      }
      processScopeStates.set(scopeKey, "unverified");
      try {
        await enqueue(async () => {
          const { record } = await readRecord();
          const next = disableOfflineOperationsPreferenceScope(
            record,
            principalId,
            workspaceId,
          );
          if (!next) {
            throw new OfflineOperationsPreferenceCapacityError(
              "Offline Operations saving preference is full",
            );
          }
          const serialized = JSON.stringify(next);
          await adapter.set(serialized);
          if ((await adapter.get()) !== serialized) {
            throw new Error(
              "Offline Operations saving preference could not be verified",
            );
          }
          processScopeStates.set(scopeKey, "cleanup-pending");
        });
      } catch (error) {
        if (error instanceof OfflineOperationsPreferenceCapacityError) {
          processScopeStates.delete(scopeKey);
        }
        throw error;
      }
    },

    async completeCleanup(
      principalId: string,
      workspaceId: string,
    ): Promise<void> {
      const scopeKey = createOfflineOperationsPreferenceScopeKey(
        principalId,
        workspaceId,
      );
      if (!scopeKey) {
        throw new Error("Offline Operations saving scope is invalid");
      }
      await enqueue(async () => {
        const { record } = await readRecord();
        const next = completeOfflineOperationsPreferenceCleanup(
          record,
          principalId,
          workspaceId,
        );
        if (!next) {
          throw new Error(
            "Offline Operations cleanup preference is unavailable",
          );
        }
        const serialized = JSON.stringify(next);
        await adapter.set(serialized);
        if ((await adapter.get()) !== serialized) {
          throw new Error(
            "Offline Operations cleanup preference could not be verified",
          );
        }
        processScopeStates.set(scopeKey, "disabled");
      });
    },

    async enable(
      principalId: string,
      workspaceId: string,
    ): Promise<void> {
      const scopeKey = createOfflineOperationsPreferenceScopeKey(
        principalId,
        workspaceId,
      );
      if (!scopeKey) {
        throw new Error("Offline Operations saving scope is invalid");
      }
      await enqueue(async () => {
        const { record } = await readRecord();
        const next = enableOfflineOperationsPreferenceScope(
          record,
          principalId,
          workspaceId,
        );
        if (!next) {
          throw new Error("Offline Operations saving scope is invalid");
        }
        const serialized = JSON.stringify(next);
        await adapter.set(serialized);
        let readback: string | null;
        try {
          readback = await adapter.get();
        } catch {
          // A fulfilled SecureStore set is the durable commit boundary. A
          // subsequent transient read failure must not report a false failed
          // Allow after the explicit enabled record may already be persisted.
          processScopeStates.delete(scopeKey);
          return;
        }
        const parsed = parseOfflineOperationsPreferenceRecord(readback);
        if (
          !parsed ||
          getOfflineOperationsPreferenceScope(
            parsed,
            principalId,
            workspaceId,
          )
        ) {
          await adapter.set(JSON.stringify(record));
          throw new Error(
            "Offline Operations saving preference could not be verified",
          );
        }
        processScopeStates.delete(scopeKey);
      });
    },

    async runIfAllowed<T>(
      principalId: string,
      workspaceId: string,
      operation: () => Promise<T>,
    ): Promise<OfflineOperationsGuardedResult<T>> {
      const scopeKey = createOfflineOperationsPreferenceScopeKey(
        principalId,
        workspaceId,
      );
      if (!scopeKey) {
        return { status: "unavailable", value: null };
      }
      const immediateGuardStatus = processGuardStatus(scopeKey);
      if (immediateGuardStatus) {
        return {
          status: immediateGuardStatus,
          value: null,
        };
      }
      try {
        return await enqueue(async () => {
          const queuedGuardStatus = processGuardStatus(scopeKey);
          if (queuedGuardStatus) {
            return { status: queuedGuardStatus, value: null };
          }
          const { record } = await readRecord();
          const scope = getOfflineOperationsPreferenceScope(
            record,
            principalId,
            workspaceId,
          );
          if (scope) {
            const status = scope.cleanupPending
              ? "cleanup-pending"
              : "disabled";
            processScopeStates.set(scopeKey, status);
            return { status, value: null };
          }
          const value = await operation();
          const completedGuardStatus = processGuardStatus(scopeKey);
          if (completedGuardStatus) {
            return { status: completedGuardStatus, value: null };
          }
          return { status: "completed", value } as const;
        });
      } catch {
        return { status: "unavailable", value: null };
      }
    },
  };
}
