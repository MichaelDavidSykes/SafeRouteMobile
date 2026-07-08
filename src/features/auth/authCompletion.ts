import { ApiSessionExpiredError } from '../api/apiClientCore';
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
        user
      }
    : {
        accessToken,
        email: fallbackEmail
      };

  await saveSession(acceptedSession);

  return acceptedSession;
}
