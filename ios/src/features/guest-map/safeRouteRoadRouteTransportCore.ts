import {
  ApiRequestError,
  createApiResponseError,
  createNetworkRequestError,
  fetchWithTimeout,
  parseJsonResponse,
  unwrapApiEnvelope,
} from '../api/apiClientCore';

export const SAFE_ROUTE_PREVIEW_MAX_PENDING_WAIT_MS = 10 * 60_000;

const SAFE_ROUTE_PREVIEW_DEFAULT_RETRY_AFTER_SECONDS = 10;
const SAFE_ROUTE_PREVIEW_MIN_RETRY_AFTER_SECONDS = 1;
const SAFE_ROUTE_PREVIEW_MAX_RETRY_AFTER_SECONDS = 30;
const SAFE_ROUTE_PREVIEW_RETRY_BACKOFF_STEP_SECONDS = 5;
const PENDING_COVERAGE_MARKERS = new Set([
  'pending',
  'queued',
  'refreshing',
  'researching',
  'scheduled',
]);

export type SafeRoutePreviewHttpRequester = (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
) => Promise<Response>;

type SafeRoutePreviewSleep = (
  delayMs: number,
  signal?: AbortSignal,
) => Promise<void>;

export type VerifiedSafeRoutePreviewRequestOptions = {
  fallbackMessage?: string;
  init: RequestInit;
  input: Parameters<typeof fetch>[0];
  maxPendingWaitMs?: number;
  now?: () => number;
  request?: SafeRoutePreviewHttpRequester;
  signal?: AbortSignal;
  sleep?: SafeRoutePreviewSleep;
  timeoutMs: number;
};

export class SafeRoutePreviewCoveragePendingError extends ApiRequestError {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      'SafeRoute is still verifying risk coverage for this route. Tap Plot Route to retry shortly.',
      503,
    );
    this.name = 'SafeRoutePreviewCoveragePendingError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Keeps a verified route request alive while the backend researches missing
 * corridor coverage. Only the backend's structured pending proof can enter
 * this loop; every other failure still fails closed immediately.
 */
export async function requestVerifiedSafeRoutePreview({
  fallbackMessage = 'Unable to prepare a verified road route.',
  init,
  input,
  maxPendingWaitMs = SAFE_ROUTE_PREVIEW_MAX_PENDING_WAIT_MS,
  now = Date.now,
  request,
  signal,
  sleep = waitForSafeRoutePreviewRetry,
  timeoutMs,
}: VerifiedSafeRoutePreviewRequestOptions): Promise<unknown> {
  const startedAtMs = now();
  const pendingDeadlineMs = startedAtMs + normalizePendingWaitMs(maxPendingWaitMs);
  let attempt = 0;
  let lastRetryAfterSeconds = SAFE_ROUTE_PREVIEW_DEFAULT_RETRY_AFTER_SECONDS;

  while (true) {
    if (signal?.aborted) {
      throw createSafeRoutePreviewAbortError();
    }
    if (attempt > 0 && now() >= pendingDeadlineMs) {
      throw new SafeRoutePreviewCoveragePendingError(lastRetryAfterSeconds);
    }

    const remainingWaitMs = Math.max(1, pendingDeadlineMs - now());
    const response = await performSafeRoutePreviewRequest({
      init,
      input,
      request,
      signal,
      timeoutMs: Math.max(1, Math.min(timeoutMs, remainingWaitMs)),
    });
    const body = await parseJsonResponse(response);
    if (response.ok) {
      return unwrapApiEnvelope<unknown>(body);
    }
    if (!isSafeRoutePreviewCoveragePendingResponse(response.status, body)) {
      throw createApiResponseError(response.status, body, fallbackMessage);
    }

    lastRetryAfterSeconds = resolveSafeRoutePreviewRetryDelaySeconds(
      getSafeRoutePreviewRetryAfterSeconds(response, body),
      attempt,
    );
    const retryDelayMs = lastRetryAfterSeconds * 1000;
    if (now() + retryDelayMs > pendingDeadlineMs) {
      throw new SafeRoutePreviewCoveragePendingError(lastRetryAfterSeconds);
    }

    await sleep(retryDelayMs, signal);
    attempt += 1;
  }
}

export function isSafeRoutePreviewCoveragePendingResponse(
  statusCode: number,
  body: unknown,
): boolean {
  if (statusCode !== 503) {
    return false;
  }
  const riskAvoidance = getRiskAvoidanceRecord(body);
  if (!riskAvoidance) {
    return false;
  }
  const status = normalizeMarker(riskAvoidance.status);
  const coverageStatus = normalizeMarker(
    riskAvoidance.coverage_status ?? riskAvoidance.coverageStatus,
  );
  return PENDING_COVERAGE_MARKERS.has(status)
    || PENDING_COVERAGE_MARKERS.has(coverageStatus);
}

export function getSafeRoutePreviewRetryAfterSeconds(
  response: Response,
  body: unknown,
  nowMs = Date.now(),
): number {
  const retryAfterValues = [
    parseRetryAfterSeconds(response.headers.get('Retry-After'), nowMs),
    getBodyRetryAfterSeconds(body),
  ].filter((value): value is number => value !== null);
  const requestedSeconds = retryAfterValues.length
    ? Math.max(...retryAfterValues)
    : SAFE_ROUTE_PREVIEW_DEFAULT_RETRY_AFTER_SECONDS;
  return Math.max(
    SAFE_ROUTE_PREVIEW_MIN_RETRY_AFTER_SECONDS,
    Math.min(SAFE_ROUTE_PREVIEW_MAX_RETRY_AFTER_SECONDS, requestedSeconds),
  );
}

export function resolveSafeRoutePreviewRetryDelaySeconds(
  retryAfterSeconds: number,
  retryIndex: number,
): number {
  const boundedRetryAfterSeconds = Number.isFinite(retryAfterSeconds)
    ? Math.max(
        SAFE_ROUTE_PREVIEW_MIN_RETRY_AFTER_SECONDS,
        Math.min(SAFE_ROUTE_PREVIEW_MAX_RETRY_AFTER_SECONDS, retryAfterSeconds),
      )
    : SAFE_ROUTE_PREVIEW_DEFAULT_RETRY_AFTER_SECONDS;
  const boundedRetryIndex = Number.isFinite(retryIndex)
    ? Math.max(0, Math.floor(retryIndex))
    : 0;
  const backoffSeconds = SAFE_ROUTE_PREVIEW_DEFAULT_RETRY_AFTER_SECONDS
    + boundedRetryIndex * SAFE_ROUTE_PREVIEW_RETRY_BACKOFF_STEP_SECONDS;
  return Math.min(
    SAFE_ROUTE_PREVIEW_MAX_RETRY_AFTER_SECONDS,
    Math.max(boundedRetryAfterSeconds, backoffSeconds),
  );
}

async function performSafeRoutePreviewRequest({
  init,
  input,
  request,
  signal,
  timeoutMs,
}: {
  init: RequestInit;
  input: Parameters<typeof fetch>[0];
  request?: SafeRoutePreviewHttpRequester;
  signal?: AbortSignal;
  timeoutMs: number;
}): Promise<Response> {
  try {
    if (request) {
      return await request(input, { ...init, signal });
    }
    return await fetchWithTimeout(input, {
      ...init,
      signal,
      timeoutMs,
    });
  } catch (error) {
    if (signal?.aborted) {
      throw createSafeRoutePreviewAbortError();
    }
    if (error instanceof ApiRequestError) {
      throw error;
    }
    throw createNetworkRequestError();
  }
}

function getRiskAvoidanceRecord(body: unknown): Record<string, unknown> | null {
  const bodyRecord = toRecord(body);
  const detailRecord = toRecord(bodyRecord?.detail);
  const dataRecord = toRecord(bodyRecord?.data);
  return toRecord(detailRecord?.risk_avoidance ?? detailRecord?.riskAvoidance)
    ?? toRecord(bodyRecord?.risk_avoidance ?? bodyRecord?.riskAvoidance)
    ?? toRecord(dataRecord?.risk_avoidance ?? dataRecord?.riskAvoidance);
}

function getBodyRetryAfterSeconds(body: unknown): number | null {
  const bodyRecord = toRecord(body);
  const detailRecord = toRecord(bodyRecord?.detail);
  const riskAvoidance = getRiskAvoidanceRecord(body);
  return normalizeRetryAfterSeconds(
    detailRecord?.retry_after_seconds
      ?? detailRecord?.retryAfterSeconds
      ?? riskAvoidance?.retry_after_seconds
      ?? riskAvoidance?.retryAfterSeconds,
  );
}

function parseRetryAfterSeconds(
  value: string | null | undefined,
  nowMs: number,
): number | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }
  const numeric = normalizeRetryAfterSeconds(normalized);
  if (numeric !== null) {
    return numeric;
  }
  if (!/[A-Za-z]/.test(normalized)) {
    return null;
  }
  const deadlineMs = Date.parse(normalized);
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) {
    return null;
  }
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

function normalizeRetryAfterSeconds(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : (typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : Number.NaN);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

function normalizePendingWaitMs(value: number): number {
  return Number.isFinite(value) && value >= 0
    ? Math.min(value, SAFE_ROUTE_PREVIEW_MAX_PENDING_WAIT_MS)
    : SAFE_ROUTE_PREVIEW_MAX_PENDING_WAIT_MS;
}

function normalizeMarker(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function waitForSafeRoutePreviewRetry(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createSafeRoutePreviewAbortError());
  }
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', handleAbort);
      reject(createSafeRoutePreviewAbortError());
    };
    signal?.addEventListener('abort', handleAbort, { once: true });
  });
}

function createSafeRoutePreviewAbortError(): Error {
  const error = new Error('SafeRoute preview request was cancelled.');
  error.name = 'AbortError';
  return error;
}
