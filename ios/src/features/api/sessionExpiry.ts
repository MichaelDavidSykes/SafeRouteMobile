import { ApiSessionExpiredError } from './apiClientCore';

export function getRequestSessionExpiry({
  authenticated,
  error,
  handled,
  requestActive
}: {
  authenticated: boolean;
  error: unknown;
  handled: boolean;
  requestActive: boolean;
}): ApiSessionExpiredError | null {
  return authenticated && requestActive && !handled && error instanceof ApiSessionExpiredError
    ? error
    : null;
}

export function shouldHandleActiveSessionExpiry({
  activeAccessToken,
  activeSessionEpoch,
  expiredAccessToken,
  expiredSessionEpoch,
  handled
}: {
  activeAccessToken?: string | null;
  activeSessionEpoch: number;
  expiredAccessToken?: string | null;
  expiredSessionEpoch: number;
  handled: boolean;
}): boolean {
  const activeToken = String(activeAccessToken || '').trim();
  const rejectedToken = String(expiredAccessToken || '').trim();
  return !handled &&
    Boolean(activeToken) &&
    activeToken === rejectedToken &&
    activeSessionEpoch === expiredSessionEpoch;
}

export async function waitForSessionCleanup(
  cleanup: Promise<unknown> | null | undefined
): Promise<void> {
  if (cleanup) {
    await cleanup;
  }
}
