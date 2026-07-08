export const LUNARCHAIN_NETWORK_ERROR_MESSAGE = 'Unable to reach LunarChain. Check your connection and retry.';
export const LUNARCHAIN_SESSION_EXPIRED_MESSAGE = 'Your LunarChain session expired. Sign in again.';
export const LUNARCHAIN_REQUEST_TIMEOUT_MS = 15000;

export type SafeRouteRequestOptions = RequestInit & {
  timeoutMs?: number;
};

export class ApiSessionExpiredError extends Error {
  constructor(message = LUNARCHAIN_SESSION_EXPIRED_MESSAGE) {
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
    detail?: { details?: string; message?: string; msg?: string } | unknown[] | string;
    error?: { details?: string; message?: string; msg?: string } | string;
    message?: string;
    details?: string;
  } | null | undefined;

  return firstNonEmptyMessage(
    extractErrorMessage(body?.detail),
    body?.details,
    body?.message,
    extractErrorMessage(body?.error),
    fallback
  ) || fallback;
}

export function getApiSessionExpiredMessage(
  responseBody: unknown,
  fallback = LUNARCHAIN_SESSION_EXPIRED_MESSAGE
): string {
  const message = getApiErrorMessage(responseBody, fallback).trim();

  if (
    !message ||
    isGenericAuthFailureMessage(message) ||
    isUnsafeSessionFailureMessage(message)
  ) {
    return fallback;
  }

  return message;
}

function firstNonEmptyMessage(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    const message = typeof candidate === 'string' ? candidate.trim() : '';
    if (message) {
      return message;
    }
  }

  return candidates[candidates.length - 1];
}

function extractErrorMessage(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractErrorMessage(item);
      if (message?.trim()) {
        return message;
      }
    }

    return undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const error = value as {
    details?: unknown;
    error?: unknown;
    message?: unknown;
    msg?: unknown;
  };

  return firstNonEmptyMessage(
    typeof error.details === 'string' ? error.details : extractErrorMessage(error.details),
    typeof error.message === 'string' ? error.message : extractErrorMessage(error.message),
    typeof error.msg === 'string' ? error.msg : extractErrorMessage(error.msg),
    typeof error.error === 'string' ? error.error : extractErrorMessage(error.error)
  );
}

function isUnsafeSessionFailureMessage(message: string): boolean {
  return [
    /internal server error/i,
    /traceback/i,
    /stack trace/i,
    /exception/i,
    /<html/i,
    /<!doctype/i,
    /\[object object\]/i
  ].some((pattern) => pattern.test(message.trim()));
}

function isGenericAuthFailureMessage(message: string): boolean {
  return [
    /^not authenticated$/i,
    /^unauthorized$/i,
    /^forbidden$/i,
    /^invalid token$/i,
    /^token expired$/i,
    /^signature has expired$/i,
    /^could not validate credentials$/i,
    /^authentication credentials were not provided$/i,
    /^missing authorization/i
  ].some((pattern) => pattern.test(message.trim()));
}

function normalizeRequestTimeoutMs(timeoutMs: number): number {
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : LUNARCHAIN_REQUEST_TIMEOUT_MS;
}
