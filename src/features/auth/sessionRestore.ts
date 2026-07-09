import { ApiSessionExpiredError } from '../api/apiClientCore';
import { isUnsafeDiagnosticMessage } from '../api/userFacingErrors';
import { getJwtExpirySeconds, isJwtExpired } from './jwt';
import type { AuthenticatedUser, AuthSession } from './authTypes';

export type SessionRestoreResult =
  | {
      status: 'empty';
    }
  | {
      status: 'expired';
      message: string;
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
  getUser: GetCurrentUser
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
      message: DEFAULT_EXPIRED_MESSAGE
    };
  }

  const expirySeconds = getJwtExpirySeconds(accessToken);

  if (isJwtExpired(accessToken)) {
    return {
      status: 'expired',
      message: DEFAULT_EXPIRED_MESSAGE
    };
  }

  try {
    const user = await getUser(accessToken);
    return {
      status: 'restored',
      validatedOnline: true,
      session: {
        ...normalizedStoredSession,
        email: user.email || normalizedStoredSession.email,
        user
      }
    };
  } catch (error) {
    if (error instanceof ApiSessionExpiredError) {
      return {
        status: 'expired',
        message: getSessionRestoreExpiredMessage(error.message)
      };
    }

    if (expirySeconds === null || !normalizedStoredSession.email) {
      return {
        status: 'expired',
        message: ONLINE_VALIDATION_REQUIRED_MESSAGE
      };
    }

    return {
      status: 'restored',
      validatedOnline: false,
      message: OFFLINE_RESTORE_MESSAGE,
      session: normalizedStoredSession
    };
  }
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
