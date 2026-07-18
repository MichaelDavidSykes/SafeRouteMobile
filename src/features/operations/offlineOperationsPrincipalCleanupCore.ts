import { normalizeOfflineOperationsPreferenceScopeIdentity } from "./offlineOperationsPreferenceCore";

const OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_SCHEMA = 1;
export const OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_MAX_BYTES = 640;

export type OfflineOperationsPrincipalCleanupPurpose =
  | "fresh-auth"
  | "terminal";

export type OfflineOperationsPrincipalCleanupRecord = {
  pending: true;
  principalId: string;
  purpose: OfflineOperationsPrincipalCleanupPurpose;
  schema: typeof OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_SCHEMA;
};

export type OfflineOperationsPrincipalCleanupAdapter = {
  get: () => Promise<string | null>;
  remove: () => Promise<void>;
  set: (value: string) => Promise<void>;
};

export type OfflineOperationsPrincipalCleanupPending = {
  durable: boolean;
  principalId: string;
  purpose: OfflineOperationsPrincipalCleanupPurpose;
};

export type OfflineOperationsPrincipalCleanupOutcome = {
  persistenceSafe: boolean;
  principalId: string | null;
  status: "clean" | "retry";
};

type OfflineOperationsPrincipalCleanupState =
  | { status: "clean" }
  | { pending: OfflineOperationsPrincipalCleanupPending; status: "pending" }
  | { status: "corrupt" };

export function createOfflineOperationsPrincipalCleanupRecord(
  principalIdValue: string,
  purpose: OfflineOperationsPrincipalCleanupPurpose,
): OfflineOperationsPrincipalCleanupRecord | null {
  const principalId =
    normalizeOfflineOperationsPreferenceScopeIdentity(principalIdValue);
  if (
    !principalId ||
    (purpose !== "fresh-auth" && purpose !== "terminal")
  ) {
    return null;
  }
  const record: OfflineOperationsPrincipalCleanupRecord = {
    pending: true,
    principalId,
    purpose,
    schema: OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_SCHEMA,
  };
  return utf8ByteLength(JSON.stringify(record)) <=
    OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_MAX_BYTES
    ? record
    : null;
}

export function parseOfflineOperationsPrincipalCleanupRecord(
  raw: string | null,
): OfflineOperationsPrincipalCleanupRecord | null {
  if (
    raw === null ||
    utf8ByteLength(raw) >
      OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_MAX_BYTES
  ) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "pending",
        "principalId",
        "purpose",
        "schema",
      ]) ||
      value.pending !== true ||
      value.schema !== OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_SCHEMA ||
      (value.purpose !== "fresh-auth" && value.purpose !== "terminal")
    ) {
      return null;
    }
    const principalId =
      normalizeOfflineOperationsPreferenceScopeIdentity(value.principalId);
    return principalId && principalId === value.principalId
      ? {
          pending: true,
          principalId,
          purpose: value.purpose,
          schema: OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_SCHEMA,
        }
      : null;
  } catch {
    return null;
  }
}

export function createOfflineOperationsPrincipalCleanupStorage(
  adapter: OfflineOperationsPrincipalCleanupAdapter,
) {
  let pendingMutation = Promise.resolve();
  let processPending: OfflineOperationsPrincipalCleanupPending | null = null;

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

  const mergePending = (
    current: OfflineOperationsPrincipalCleanupPending,
    requested: OfflineOperationsPrincipalCleanupRecord,
  ): OfflineOperationsPrincipalCleanupPending => {
    if (
      current.principalId !== requested.principalId &&
      requested.purpose !== "terminal"
    ) {
      throw new Error(
        "Another Offline Operations principal cleanup is pending",
      );
    }
    return {
      durable: current.durable,
      // A terminal request is a global authentication boundary. If it arrives
      // behind an older Calendar cleanup, retaining the older principal is
      // sufficient because clearing that single cache key removes either
      // principal's stored value.
      principalId: current.principalId,
      purpose:
        current.purpose === "terminal" ||
        requested.purpose === "terminal"
          ? "terminal"
          : "fresh-auth",
    };
  };

  return {
    async begin(
      principalIdValue: string,
      purpose: OfflineOperationsPrincipalCleanupPurpose,
    ): Promise<OfflineOperationsPrincipalCleanupPending> {
      const record =
        createOfflineOperationsPrincipalCleanupRecord(
          principalIdValue,
          purpose,
        );
      if (!record) {
        throw new Error(
          "Offline Operations principal cleanup identity is invalid",
        );
      }
      return enqueue(async () => {
        const durableState = await readDurableState(adapter);
        if (durableState.status === "corrupt") {
          throw new Error(
            "Offline Operations principal cleanup record is invalid",
          );
        }

        const current =
          durableState.status === "pending"
            ? durableState.pending
            : processPending;
        const nextPending = current
          ? mergePending(current, record)
          : {
              durable: false,
              principalId: record.principalId,
              purpose: record.purpose,
            };
        const nextRecord =
          createOfflineOperationsPrincipalCleanupRecord(
            nextPending.principalId,
            nextPending.purpose,
          );
        if (!nextRecord) {
          throw new Error(
            "Offline Operations principal cleanup identity is invalid",
          );
        }
        const serialized = JSON.stringify(nextRecord);
        const currentSerialized =
          durableState.status === "pending"
            ? JSON.stringify({
                pending: true,
                principalId: durableState.pending.principalId,
                purpose: durableState.pending.purpose,
                schema: OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_SCHEMA,
              } satisfies OfflineOperationsPrincipalCleanupRecord)
            : null;

        if (serialized === currentSerialized) {
          processPending = {
            ...nextPending,
            durable: true,
          };
          return processPending;
        }

        processPending = {
          ...nextPending,
          durable: false,
        };
        try {
          await adapter.set(serialized);
          if ((await adapter.get()) !== serialized) {
            return processPending;
          }
        } catch {
          return processPending;
        }
        processPending = {
          ...nextPending,
          durable: true,
        };
        return processPending;
      });
    },

    async complete(principalIdValue: string): Promise<void> {
      const principalId =
        normalizeOfflineOperationsPreferenceScopeIdentity(
          principalIdValue,
        );
      if (!principalId) {
        throw new Error(
          "Offline Operations principal cleanup identity is invalid",
        );
      }
      await enqueue(async () => {
        const state = await readDurableState(adapter);
        if (state.status === "corrupt") {
          throw new Error(
            "Offline Operations principal cleanup record is invalid",
          );
        }
        const pending =
          state.status === "pending" ? state.pending : processPending;
        if (pending && pending.principalId !== principalId) {
          throw new Error(
            "Another Offline Operations principal cleanup is pending",
          );
        }
        await adapter.remove();
        if ((await adapter.get()) !== null) {
          throw new Error(
            "Offline Operations principal cleanup completion could not be verified",
          );
        }
        processPending = null;
      });
    },

    async getState(): Promise<OfflineOperationsPrincipalCleanupState> {
      return enqueue(async () => {
        const durableState = await readDurableState(adapter);
        if (durableState.status === "pending") {
          processPending = durableState.pending;
          return durableState;
        }
        if (durableState.status === "corrupt") {
          return durableState;
        }
        return processPending
          ? { pending: processPending, status: "pending" }
          : durableState;
      });
    },

    async reset(): Promise<void> {
      await enqueue(async () => {
        await adapter.remove();
        if ((await adapter.get()) !== null) {
          throw new Error(
            "Offline Operations principal cleanup reset could not be verified",
          );
        }
        processPending = null;
      });
    },
  };
}

export function createOfflineOperationsPrincipalCleanupCoordinator({
  activatePrincipal,
  clearAll,
  clearPrincipal,
  storage,
}: {
  activatePrincipal: (principalId: string) => Promise<void>;
  clearAll: () => Promise<void>;
  clearPrincipal: (principalId: string) => Promise<void>;
  storage: ReturnType<
    typeof createOfflineOperationsPrincipalCleanupStorage
  >;
}) {
  let pendingOperation = Promise.resolve();

  const enqueue = async (
    operation: () => Promise<OfflineOperationsPrincipalCleanupOutcome>,
  ): Promise<OfflineOperationsPrincipalCleanupOutcome> => {
    const current = pendingOperation
      .catch(() => undefined)
      .then(operation);
    pendingOperation = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  };

  const retry = (
    principalId: string | null,
    persistenceSafe = false,
  ): OfflineOperationsPrincipalCleanupOutcome => ({
    persistenceSafe,
    principalId,
    status: "retry",
  });

  const recoverPending = async (
    activatePrincipalId: string | null,
    commitTerminalBoundary: (() => Promise<void>) | null,
  ): Promise<OfflineOperationsPrincipalCleanupOutcome> => {
    let state: OfflineOperationsPrincipalCleanupState;
    try {
      state = await storage.getState();
    } catch {
      return retry(null);
    }

    if (state.status === "corrupt") {
      // A malformed record cannot safely disclose whether it represented a
      // sign-out. Require the terminal callback before repairing the exact
      // Calendar cache key and journal; preference storage is separate.
      if (!commitTerminalBoundary) {
        return retry(null);
      }
      try {
        await commitTerminalBoundary();
        await clearAll();
        await storage.reset();
      } catch {
        return retry(null);
      }
    }

    const pending =
      state.status === "pending" ? state.pending : null;
    if (pending) {
      if (pending.purpose === "terminal") {
        if (!commitTerminalBoundary) {
          return retry(pending.principalId);
        }
        try {
          await commitTerminalBoundary();
        } catch {
          return retry(pending.principalId);
        }
      }
      try {
        await clearPrincipal(pending.principalId);
      } catch {
        return retry(
          pending.principalId,
          pending.purpose === "fresh-auth" && pending.durable,
        );
      }
      try {
        await storage.complete(pending.principalId);
      } catch {
        return retry(
          pending.principalId,
          pending.purpose === "fresh-auth" && pending.durable,
        );
      }
    }

    if (activatePrincipalId) {
      const principalId =
        normalizeOfflineOperationsPreferenceScopeIdentity(
          activatePrincipalId,
        );
      if (!principalId) {
        return retry(null);
      }
      try {
        await activatePrincipal(principalId);
      } catch {
        return retry(principalId, true);
      }
    }
    return {
      persistenceSafe: true,
      principalId: pending?.principalId || null,
      status: "clean",
    };
  };

  return {
    recover(
      activatePrincipalId: string | null = null,
      commitTerminalBoundary: (() => Promise<void>) | null = null,
    ): Promise<OfflineOperationsPrincipalCleanupOutcome> {
      return enqueue(() =>
        recoverPending(
          activatePrincipalId,
          commitTerminalBoundary,
        ),
      );
    },

    prepareFreshAuthentication(
      principalIdValue: string,
    ): Promise<OfflineOperationsPrincipalCleanupOutcome> {
      return enqueue(async () => {
        const priorRecovery = await recoverPending(null, null);
        if (priorRecovery.status !== "clean") {
          return retry(priorRecovery.principalId);
        }
        const record =
          createOfflineOperationsPrincipalCleanupRecord(
            principalIdValue,
            "fresh-auth",
          );
        if (!record) {
          return retry(null);
        }
        let pending: OfflineOperationsPrincipalCleanupPending;
        try {
          pending = await storage.begin(
            record.principalId,
            record.purpose,
          );
        } catch {
          pending = {
            durable: false,
            principalId: record.principalId,
            purpose: record.purpose,
          };
        }
        try {
          await clearPrincipal(record.principalId);
        } catch {
          return retry(record.principalId, pending.durable);
        }
        try {
          await storage.complete(pending.principalId);
        } catch {
          return retry(record.principalId, pending.durable);
        }
        try {
          await activatePrincipal(record.principalId);
        } catch {
          return retry(record.principalId, true);
        }
        return {
          persistenceSafe: true,
          principalId: record.principalId,
          status: "clean",
        };
      });
    },

    purgeTerminal(
      principalIdValue: string,
      commitTerminalBoundary: () => Promise<void>,
    ): Promise<OfflineOperationsPrincipalCleanupOutcome> {
      return enqueue(async () => {
        const record =
          createOfflineOperationsPrincipalCleanupRecord(
            principalIdValue,
            "terminal",
          );
        if (!record) {
          try {
            await commitTerminalBoundary();
            await clearAll();
            await storage.reset();
          } catch {
            return retry(null);
          }
          return {
            persistenceSafe: true,
            principalId: null,
            status: "clean",
          };
        }

        let pending: OfflineOperationsPrincipalCleanupPending | null =
          null;
        try {
          pending = await storage.begin(
            record.principalId,
            record.purpose,
          );
        } catch {
          // A global auth tombstone plus a verified removal of the single
          // Calendar cache is the conservative fallback when the journal
          // cannot be inspected or repaired in place.
        }

        try {
          await commitTerminalBoundary();
        } catch {
          return retry(pending?.principalId || record.principalId);
        }

        if (!pending?.durable) {
          try {
            await clearAll();
            await storage.reset();
          } catch {
            return retry(pending?.principalId || record.principalId);
          }
          return {
            persistenceSafe: true,
            principalId: pending?.principalId || record.principalId,
            status: "clean",
          };
        }

        try {
          await clearPrincipal(pending.principalId);
          await storage.complete(pending.principalId);
        } catch {
          return retry(pending.principalId);
        }
        return {
          persistenceSafe: true,
          principalId: pending.principalId,
          status: "clean",
        };
      });
    },
  };
}

async function readDurableState(
  adapter: OfflineOperationsPrincipalCleanupAdapter,
): Promise<OfflineOperationsPrincipalCleanupState> {
  const raw = await adapter.get();
  if (raw === null) {
    return { status: "clean" };
  }
  const record = parseOfflineOperationsPrincipalCleanupRecord(raw);
  return record
    ? {
        pending: {
          durable: true,
          principalId: record.principalId,
          purpose: record.purpose,
        },
        status: "pending",
      }
    : { status: "corrupt" };
}

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
