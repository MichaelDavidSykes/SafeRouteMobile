import { ApiSessionExpiredError } from '../api/apiClientCore';
import { resolveActiveSessionExpiry } from './activeSessionExpiry';
import type { AuthenticatedUser, AuthSession } from './authTypes';

type SaveAuthSession = (session: AuthSession) => Promise<void>;
type GetCurrentUser = (accessToken: string) => Promise<AuthenticatedUser>;

export async function prepareAuthenticatedSession(
  nextSession: AuthSession,
  saveSession: SaveAuthSession,
  getCurrentUser: GetCurrentUser
): Promise<AuthSession> {
  const accessToken = String(nextSession.accessToken || '').trim();
  const fallbackEmail = String(nextSession.email || '').trim();

  if (!accessToken) {
    throw new ApiSessionExpiredError('Sign in again before loading saved SafeRoute data.');
  }

  let user: AuthenticatedUser | undefined;

  try {
    user = await getCurrentUser(accessToken);
  } catch (error) {
    if (error instanceof ApiSessionExpiredError) {
      throw error;
    }
  }

  const acceptedSession: AuthSession = user
    ? {
        ...nextSession,
        accessToken,
        email: user.email || fallbackEmail,
        principalId: user.id,
        user
      }
    : {
        accessToken,
        email: fallbackEmail,
        principalId: nextSession.principalId
      };

  if (!String(acceptedSession.principalId || '').trim()) {
    throw new Error('Unable to verify the LunarChain account identity. Check your connection and retry.');
  }

  if (
    resolveActiveSessionExpiry({ accessToken }).status === 'expired'
  ) {
    throw new ApiSessionExpiredError(
      'Your LunarChain session expired. Sign in again.',
    );
  }

  await saveSession(acceptedSession);

  return acceptedSession;
}
