import {
  ApiRequestError,
  createApiResponseError,
  createNetworkRequestError,
  fetchWithTimeout,
  parseJsonResponse,
  unwrapApiEnvelope,
} from '../api/apiClientCore';

const SAFE_ROUTE_PREVIEW_DEFAULT_RETRY_AFTER_SECONDS = 10;
const SAFE_ROUTE_PREVIEW_PROVISIONAL_RETRY_AFTER_SECONDS = 2;
const SAFE_ROUTE_PREVIEW_MIN_RETRY_AFTER_SECONDS = 1;
const SAFE_ROUTE_PREVIEW_MAX_RETRY_AFTER_SECONDS = 30;
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

export type VerifiedSafeRoutePreviewRequestOptions = {
  fallbackMessage?: string;
  init: RequestInit;
  input: Parameters<typeof fetch>[0];
  now?: () => number;
  onProvisionalResponse?: (response: unknown) => void;
  request?: SafeRoutePreviewHttpRequester;
  signal?: AbortSignal;
  timeoutMs: number;
};

export class SafeRoutePreviewCoveragePendingError extends ApiRequestError {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      'SafeRoute could not read a usable risk snapshot. Tap Plot Route to retry.',
      503,
    );
    this.name = 'SafeRoutePreviewCoveragePendingError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Performs exactly one route request for each explicit user action. A pending
 * backend response is terminal: the client never polls and silently replaces
 * geometry that is already visible to the user.
 */
export async function requestVerifiedSafeRoutePreview(
  options: VerifiedSafeRoutePreviewRequestOptions,
): Promise<unknown> {
  const {
    fallbackMessage = 'Unable to prepare a verified road route.',
    init,
    input,
    now = Date.now,
    onProvisionalResponse,
    request,
    signal,
    timeoutMs,
  } = options;
  if (signal?.aborted) {
    throw createSafeRoutePreviewAbortError();
  }
  const response = await performSafeRoutePreviewRequest({
    init,
    input,
    request,
    signal,
    timeoutMs,
  });
  if (signal?.aborted) {
    throw createSafeRoutePreviewAbortError();
  }
  const body = await parseJsonResponse(response);
  const provisionalResponse = isSafeRoutePreviewProvisionalResponse(
    response.status,
    body,
  );
  const pendingResponse = provisionalResponse
    || isSafeRoutePreviewCoveragePendingResponse(response.status, body);
  if (response.ok && !pendingResponse) {
    return unwrapApiEnvelope<unknown>(body);
  }
  if (!pendingResponse) {
    throw createApiResponseError(response.status, body, fallbackMessage);
  }
  if (provisionalResponse) {
    onProvisionalResponse?.(unwrapApiEnvelope<unknown>(body));
    if (signal?.aborted) {
      throw createSafeRoutePreviewAbortError();
    }
  }
  const retryAfterSeconds = resolveSafeRoutePreviewRetryDelaySeconds(
    getSafeRoutePreviewRetryAfterSeconds(
      response,
      body,
      now(),
      provisionalResponse
        ? SAFE_ROUTE_PREVIEW_PROVISIONAL_RETRY_AFTER_SECONDS
        : SAFE_ROUTE_PREVIEW_DEFAULT_RETRY_AFTER_SECONDS,
    ),
  );
  throw new SafeRoutePreviewCoveragePendingError(retryAfterSeconds);
}

export function isSafeRoutePreviewProvisionalResponse(
  statusCode: number,
  body: unknown,
): boolean {
  if (statusCode < 200 || statusCode >= 300) {
    return false;
  }
  const riskAvoidance = getRiskAvoidanceRecord(body);
  if (!riskAvoidance) {
    return false;
  }
  return normalizeMarker(riskAvoidance.status) === 'pending'
    && normalizeMarker(
      riskAvoidance.coverage_status ?? riskAvoidance.coverageStatus,
    ) === 'pending';
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
  fallbackSeconds = SAFE_ROUTE_PREVIEW_DEFAULT_RETRY_AFTER_SECONDS,
): number {
  const retryAfterValues = [
    parseRetryAfterSeconds(response.headers.get('Retry-After'), nowMs),
    getBodyRetryAfterSeconds(body),
  ].filter((value): value is number => value !== null);
  const requestedSeconds = retryAfterValues.length
    ? Math.max(...retryAfterValues)
    : fallbackSeconds;
  return Math.max(
    SAFE_ROUTE_PREVIEW_MIN_RETRY_AFTER_SECONDS,
    Math.min(SAFE_ROUTE_PREVIEW_MAX_RETRY_AFTER_SECONDS, requestedSeconds),
  );
}

export function resolveSafeRoutePreviewRetryDelaySeconds(
  retryAfterSeconds: number,
): number {
  return Number.isFinite(retryAfterSeconds)
    ? Math.max(
        SAFE_ROUTE_PREVIEW_MIN_RETRY_AFTER_SECONDS,
        Math.min(SAFE_ROUTE_PREVIEW_MAX_RETRY_AFTER_SECONDS, retryAfterSeconds),
      )
    : SAFE_ROUTE_PREVIEW_DEFAULT_RETRY_AFTER_SECONDS;
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

function normalizeMarker(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function createSafeRoutePreviewAbortError(): Error {
  const error = new Error('SafeRoute preview request was cancelled.');
  error.name = 'AbortError';
  return error;
}
