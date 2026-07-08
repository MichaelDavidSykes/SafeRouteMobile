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

export const LUNARCHAIN_CONNECTION_ERROR = 'Unable to reach LunarChain. Check your connection and try again.';

export function getUserFacingErrorMessage(
  error: unknown,
  fallback: string,
  connectionMessage = LUNARCHAIN_CONNECTION_ERROR
): string {
  const message = extractErrorMessage(error);

  if (!message) {
    return fallback;
  }

  if (isLikelyNetworkErrorMessage(message)) {
    return connectionMessage;
  }

  return message;
}

export function isLikelyNetworkErrorMessage(message: string): boolean {
  const normalizedMessage = String(message || '').trim();
  return NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
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
