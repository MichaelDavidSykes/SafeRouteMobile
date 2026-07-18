import { ApiSessionExpiredError } from '../api/apiClientCore';
import { isUnsafeDiagnosticMessage } from '../api/userFacingErrors';
import { getOfflineAccessJwtClaims, isJwtExpired } from './jwt';
import type { AuthenticatedUser, AuthSession } from './authTypes';

export type SessionRestoreResult =
  | {
      status: 'empty';
    }
  | {
      status: 'expired';
      message: string;
      reason: 'inactive-account' | 'principal-changed' | 'session-expired';
    }
  | {
      status: 'restored';
      session: AuthSession;
      validatedOnline: boolean;
      message?: string;
    };

type GetCurrentUser = (accessToken: string) => Promise<AuthenticatedUser>;

const DEFAULT_EXPIRED_MESSAGE = 'Your LunarChain session expired. Sign in again.';
const OFFLINE_RESTORE_MESSAGE = 'Using your saved LunarChain session. Some SafeRoute data may need a network refresh.';
const ONLINE_VALIDATION_REQUIRED_MESSAGE = 'Your saved LunarChain session needs online validation. Sign in again to unlock saved routes.';
const PRINCIPAL_CHANGED_MESSAGE =
  'This saved session belongs to another account. Sign in again.';

const GENERIC_SESSION_REJECTION_PATTERNS = [
  /^not authenticated$/i,
  /^unauthorized$/i,
  /^forbidden$/i,
  /^invalid token$/i,
  /^token expired$/i,
  /^signature has expired$/i,
  /^could not validate credentials$/i,
  /^authentication credentials were not provided$/i,
  /^missing authorization/i
];

export async function restoreSavedSession(
  storedSession: AuthSession | null,
  getUser: GetCurrentUser,
  options: {
    validateOnline?: boolean;
  } = {},
): Promise<SessionRestoreResult> {
  if (!storedSession) {
    return { status: 'empty' };
  }

  const accessToken = String(storedSession.accessToken || '').trim();
  const normalizedStoredSession: AuthSession = {
    ...storedSession,
    accessToken,
    email: String(storedSession.email || '').trim()
  };

  if (!accessToken) {
    return {
      status: 'expired',
      message: DEFAULT_EXPIRED_MESSAGE,
      reason: 'session-expired',
    };
  }

  const nowSeconds = Date.now() / 1000;
  const offlineAccessClaims = getOfflineAccessJwtClaims(accessToken, nowSeconds);

  if (offlineAccessClaims && isJwtExpired(accessToken, nowSeconds)) {
    return {
      status: 'expired',
      message: DEFAULT_EXPIRED_MESSAGE,
      reason: 'session-expired',
    };
  }

  if (options.validateOnline === false) {
    return restoreStrictOfflineSession(
      normalizedStoredSession,
      offlineAccessClaims,
    );
  }

  try {
    const user = await getUser(accessToken);
    const storedPrincipalId = String(
      normalizedStoredSession.principalId || '',
    ).trim();
    const currentPrincipalId = String(user.id || '').trim();
    if (
      storedPrincipalId &&
      currentPrincipalId &&
      storedPrincipalId !== currentPrincipalId
    ) {
      return {
        status: 'expired',
        message: PRINCIPAL_CHANGED_MESSAGE,
        reason: 'principal-changed',
      };
    }
    return {
      status: 'restored',
      validatedOnline: true,
      session: {
        ...normalizedStoredSession,
        email: user.email || normalizedStoredSession.email,
        principalId: currentPrincipalId || storedPrincipalId,
        user
      }
    };
  } catch (error) {
    if (error instanceof ApiSessionExpiredError) {
      return {
        status: 'expired',
        message: getSessionRestoreExpiredMessage(error.message),
        reason: error.reason,
      };
    }

    return restoreStrictOfflineSession(
      normalizedStoredSession,
      offlineAccessClaims,
    );
  }
}

function restoreStrictOfflineSession(
  normalizedStoredSession: AuthSession,
  offlineAccessClaims: ReturnType<typeof getOfflineAccessJwtClaims>,
): SessionRestoreResult {
  const storedEmail = normalizedStoredSession.email.trim().toLowerCase();
  const storedPrincipalId = String(normalizedStoredSession.principalId || '').trim();
  if (
    !offlineAccessClaims ||
    !storedEmail ||
    !storedPrincipalId ||
    offlineAccessClaims.sub.trim().toLowerCase() !== storedEmail
  ) {
    return {
      status: 'expired',
      message: ONLINE_VALIDATION_REQUIRED_MESSAGE,
      reason: 'session-expired',
    };
  }

  return {
    status: 'restored',
    validatedOnline: false,
    message: OFFLINE_RESTORE_MESSAGE,
    session: normalizedStoredSession
  };
}

function getSessionRestoreExpiredMessage(message: string | undefined): string {
  const normalizedMessage = String(message || '').trim();

  if (
    !normalizedMessage ||
    GENERIC_SESSION_REJECTION_PATTERNS.some((pattern) => pattern.test(normalizedMessage)) ||
    isUnsafeDiagnosticMessage(normalizedMessage)
  ) {
    return DEFAULT_EXPIRED_MESSAGE;
  }

  return normalizedMessage;
}
