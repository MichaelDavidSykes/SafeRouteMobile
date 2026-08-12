export const SAFE_ROUTE_PREVIEW_CACHE_TTL_MS = 15_000;
export const SAFE_ROUTE_PREVIEW_CACHE_MAX_ENTRIES = 6;

type CachedPreview<T> = {
  cachedAtMs: number;
  value: T;
};

type InFlightPreview<T> = {
  controller: AbortController;
  promise: Promise<T>;
  subscriberCount: number;
};

export type SafeRoutePreviewCacheOptions<T> = {
  load: (signal: AbortSignal) => Promise<T>;
  nowMs?: number;
  shouldCache?: (value: T) => boolean;
  signal?: AbortSignal;
  useCachedResult?: boolean;
};

/**
 * Keeps verified previews in memory only. A small entry cap and short TTL avoid
 * retaining route geometry or safety intelligence beyond an immediate retry.
 */
export class SafeRoutePreviewRequestCache<T> {
  private readonly cached = new Map<string, CachedPreview<T>>();
  private readonly inFlight = new Map<string, InFlightPreview<T>>();
  private generation = 0;

  constructor(
    private readonly ttlMs = SAFE_ROUTE_PREVIEW_CACHE_TTL_MS,
    private readonly maxEntries = SAFE_ROUTE_PREVIEW_CACHE_MAX_ENTRIES,
  ) {}

  getOrLoad(
    key: string,
    {
      load,
      nowMs = Date.now(),
      shouldCache = () => true,
      signal,
      useCachedResult = true,
    }: SafeRoutePreviewCacheOptions<T>,
  ): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(createSafeRoutePreviewAbortError());
    }

    this.prune(nowMs);
    if (!useCachedResult) {
      // A safety-triggered refresh must replace, rather than race with, an
      // older completed preview for the same route intent.
      this.cached.delete(key);
    }
    const cached = useCachedResult ? this.cached.get(key) : undefined;
    if (cached) {
      this.cached.delete(key);
      this.cached.set(key, cached);
      return Promise.resolve(cached.value);
    }

    let active = this.inFlight.get(key);
    if (active?.controller.signal.aborted) {
      this.inFlight.delete(key);
      active = undefined;
    }
    if (!active) {
      const controller = new AbortController();
      const requestGeneration = this.generation;
      const next: InFlightPreview<T> = {
        controller,
        promise: Promise.resolve(undefined as T),
        subscriberCount: 0,
      };
      next.promise = Promise.resolve()
        .then(() => {
          if (
            controller.signal.aborted ||
            requestGeneration !== this.generation
          ) {
            throw createSafeRoutePreviewAbortError();
          }
          return load(controller.signal);
        })
        .then((value) => {
          if (
            controller.signal.aborted ||
            requestGeneration !== this.generation
          ) {
            throw createSafeRoutePreviewAbortError();
          }
          if (shouldCache(value)) {
            this.put(key, value, Date.now());
          }
          return value;
        })
        .finally(() => {
          if (this.inFlight.get(key) === next) {
            this.inFlight.delete(key);
          }
        });
      this.inFlight.set(key, next);
      active = next;
    }

    return subscribeToSafeRoutePreview(active, signal);
  }

  clear({ abortInFlight = false }: { abortInFlight?: boolean } = {}): void {
    this.cached.clear();
    if (abortInFlight) {
      this.generation += 1;
      for (const entry of this.inFlight.values()) {
        entry.controller.abort();
      }
      this.inFlight.clear();
    }
  }

  private put(key: string, value: T, cachedAtMs: number): void {
    this.cached.delete(key);
    this.cached.set(key, { cachedAtMs, value });
    while (this.cached.size > Math.max(1, this.maxEntries)) {
      const oldestKey = this.cached.keys().next().value;
      if (typeof oldestKey !== 'string') {
        break;
      }
      this.cached.delete(oldestKey);
    }
  }

  private prune(nowMs: number): void {
    for (const [key, entry] of this.cached.entries()) {
      if (
        !Number.isFinite(entry.cachedAtMs) ||
        entry.cachedAtMs > nowMs ||
        nowMs - entry.cachedAtMs > Math.max(0, this.ttlMs)
      ) {
        this.cached.delete(key);
      }
    }
  }
}

function subscribeToSafeRoutePreview<T>(
  active: InFlightPreview<T>,
  signal?: AbortSignal,
): Promise<T> {
  active.subscriberCount += 1;

  return new Promise<T>((resolve, reject) => {
    let subscriptionOpen = true;
    const closeSubscription = () => {
      if (!subscriptionOpen) {
        return;
      }
      subscriptionOpen = false;
      signal?.removeEventListener('abort', handleAbort);
      active.subscriberCount = Math.max(0, active.subscriberCount - 1);
    };
    const handleAbort = () => {
      if (!subscriptionOpen) {
        return;
      }
      closeSubscription();
      if (active.subscriberCount === 0) {
        active.controller.abort();
      }
      reject(createSafeRoutePreviewAbortError());
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
    active.promise.then(
      (value) => {
        if (!subscriptionOpen) {
          return;
        }
        closeSubscription();
        resolve(value);
      },
      (error: unknown) => {
        if (!subscriptionOpen) {
          return;
        }
        closeSubscription();
        reject(error);
      },
    );
  });
}

function createSafeRoutePreviewAbortError(): Error {
  const error = new Error('SafeRoute preview request was cancelled.');
  error.name = 'AbortError';
  return error;
}
