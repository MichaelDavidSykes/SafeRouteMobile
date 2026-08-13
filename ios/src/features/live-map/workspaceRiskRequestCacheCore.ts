export interface WorkspaceRiskRequestCache<T> {
  invalidate(key?: string | null): void;
  peek(options: { identity: string; key: string; nowMs?: number }): {
    fresh: boolean;
    value: T;
  } | null;
  read(options: {
    bypassCache?: boolean;
    identity: string;
    key: string;
    load: () => Promise<T>;
    nowMs?: number;
  }): Promise<T>;
}

export function createWorkspaceRiskRequestCache<T>({
  clone,
  maxEntries = 8,
  ttlMs = 2 * 60 * 1000,
}: {
  clone: (value: T) => T;
  maxEntries?: number;
  ttlMs?: number;
}): WorkspaceRiskRequestCache<T> {
  const entries = new Map<string, { cachedAtMs: number; identity: string; value: T }>();
  const pending = new Map<string, { identity: string; promise: Promise<T> }>();
  const generations = new Map<string, number>();
  let epoch = 0;

  const peek: WorkspaceRiskRequestCache<T>["peek"] = ({ identity, key, nowMs = Date.now() }) => {
    const entry = entries.get(key);
    if (!entry || entry.identity !== identity) {
      return null;
    }
    return {
      fresh: nowMs >= entry.cachedAtMs && nowMs - entry.cachedAtMs <= ttlMs,
      value: clone(entry.value),
    };
  };

  return {
    invalidate(keyValue) {
      const key = String(keyValue || "").trim();
      if (key) {
        generations.set(key, (generations.get(key) || 0) + 1);
        entries.delete(key);
        pending.delete(key);
      } else {
        epoch += 1;
        entries.clear();
        pending.clear();
        generations.clear();
      }
    },
    peek,
    read({ bypassCache = false, identity, key, load, nowMs = Date.now() }) {
      const snapshot = peek({ identity, key, nowMs });
      if (!bypassCache && snapshot?.fresh) {
        return Promise.resolve(snapshot.value);
      }
      const inFlight = pending.get(key);
      if (!bypassCache && inFlight?.identity === identity) {
        return inFlight.promise.then(clone);
      }
      const requestEpoch = epoch;
      const generation = (generations.get(key) || 0) + 1;
      generations.set(key, generation);
      const promise = load().then((value) => {
        if (epoch === requestEpoch && generations.get(key) === generation) {
          entries.delete(key);
          entries.set(key, { cachedAtMs: nowMs, identity, value: clone(value) });
          while (entries.size > Math.max(1, maxEntries)) {
            entries.delete(entries.keys().next().value!);
          }
        }
        return clone(value);
      }).finally(() => {
        if (pending.get(key)?.promise === promise) {
          pending.delete(key);
        }
      });
      pending.set(key, { identity, promise });
      return promise;
    },
  };
}
