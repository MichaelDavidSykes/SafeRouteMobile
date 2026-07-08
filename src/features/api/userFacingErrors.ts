import { ApiRequestError } from './apiClientCore';

const NETWORK_ERROR_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /networkerror/i,
  /internet connection appears to be offline/i,
  /load failed/i,
  /request timed out/i,
  /timeout/i,
  /timed out/i,
  /aborted/i
];

const UNSAFE_DIAGNOSTIC_PATTERNS = [
  /internal server error/i,
  /traceback/i,
  /stack trace/i,
  /exception/i,
  /<html/i,
  /<!doctype/i,
  /\[object object\]/i
];

export const LUNARCHAIN_CONNECTION_ERROR = 'Unable to reach LunarChain. Check your connection and try again.';
export const LUNARCHAIN_RATE_LIMIT_ERROR = 'Too many attempts. Wait a moment and try again.';
export const LUNARCHAIN_SERVER_ERROR = 'LunarChain is having trouble. Try again soon.';

export function getUserFacingErrorMessage(
  error: unknown,
  fallback: string,
  connectionMessage = LUNARCHAIN_CONNECTION_ERROR
): string {
  const message = extractErrorMessage(error);
  const statusCode = extractStatusCode(error);

  if (isLikelyNetworkErrorMessage(message) || statusCode === 0) {
    return connectionMessage;
  }

  if (statusCode === 429) {
    return LUNARCHAIN_RATE_LIMIT_ERROR;
  }

  if (statusCode !== null && statusCode >= 500) {
    return LUNARCHAIN_SERVER_ERROR;
  }

  if (!message || isUnsafeDiagnosticMessage(message)) {
    return fallback;
  }

  return message;
}

export function isLikelyNetworkErrorMessage(message: string): boolean {
  const normalizedMessage = String(message || '').trim();
  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
}

export function isUnsafeDiagnosticMessage(message: string): boolean {
  const normalizedMessage = String(message || '').trim();
  return UNSAFE_DIAGNOSTIC_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.trim();
  }

  if (typeof error === 'string') {
    return error.trim();
  }

  return '';
}

function extractStatusCode(error: unknown): number | null {
  if (error instanceof ApiRequestError) {
    return normalizeStatusCode(error.statusCode);
  }

  if (error && typeof error === 'object' && 'statusCode' in error) {
    return normalizeStatusCode((error as { statusCode?: unknown }).statusCode);
  }

  return null;
}

function normalizeStatusCode(statusCode: unknown): number | null {
  if (typeof statusCode !== 'number' || !Number.isFinite(statusCode)) {
    return null;
  }

  return statusCode;
}
