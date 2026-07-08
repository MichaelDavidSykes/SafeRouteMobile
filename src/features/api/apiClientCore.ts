export const LUNARCHAIN_NETWORK_ERROR_MESSAGE = 'Unable to reach LunarChain. Check your connection and retry.';
export const LUNARCHAIN_REQUEST_TIMEOUT_MS = 15000;

export type SafeRouteRequestOptions = RequestInit & {
  timeoutMs?: number;
};

export class ApiSessionExpiredError extends Error {
  constructor(message = 'Your LunarChain session expired. Sign in again.') {
    super(message);
    this.name = 'ApiSessionExpiredError';
  }
}

export class ApiRequestError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.statusCode = statusCode;
  }
}

export function createNetworkRequestError(): ApiRequestError {
  return new ApiRequestError(LUNARCHAIN_NETWORK_ERROR_MESSAGE, 0);
}

export async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  options: SafeRouteRequestOptions = {}
): Promise<Response> {
  const {
    signal: callerSignal,
    timeoutMs = LUNARCHAIN_REQUEST_TIMEOUT_MS,
    ...requestOptions
  } = options;
  const normalizedTimeoutMs = normalizeRequestTimeoutMs(timeoutMs);

  if (typeof AbortController === 'undefined') {
    try {
      return await fetch(input, {
        ...requestOptions,
        ...(callerSignal ? { signal: callerSignal } : {})
      });
    } catch {
      throw createNetworkRequestError();
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, normalizedTimeoutMs);

  const abortFromCaller = () => {
    controller.abort();
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', abortFromCaller, { once: true });
    }
  }

  try {
    return await fetch(input, {
      ...requestOptions,
      signal: controller.signal
    });
  } catch {
    throw createNetworkRequestError();
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export function unwrapApiEnvelope<T>(responseBody: unknown): T {
  const body = responseBody as { data?: T } | T | null | undefined;
  return ((body && typeof body === 'object' && 'data' in body ? body.data : body) || {}) as T;
}

export function getApiErrorMessage(responseBody: unknown, fallback: string): string {
  const body = responseBody as {
    detail?: { details?: string; message?: string } | string;
    message?: string;
    details?: string;
  } | null | undefined;

  if (typeof body?.detail === 'string') {
    return firstNonEmptyMessage(body.detail, fallback);
  }

  if (body?.detail && typeof body.detail === 'object') {
    return firstNonEmptyMessage(body.detail.details, body.detail.message, fallback);
  }

  return firstNonEmptyMessage(body?.details, body?.message, fallback);
}

function firstNonEmptyMessage(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const message = typeof candidate === 'string' ? candidate.trim() : '';
    if (message) {
      return message;
    }
  }

  return candidates[candidates.length - 1] || 'Unable to reach LunarChain.';
}

function normalizeRequestTimeoutMs(timeoutMs: number): number {
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : LUNARCHAIN_REQUEST_TIMEOUT_MS;
}
