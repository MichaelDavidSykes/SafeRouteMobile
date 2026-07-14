import type { AuthSession } from './authTypes';

export function getAuthSessionPrincipalId(
  session: AuthSession | null | undefined
): string {
  return String(session?.user?.id || session?.principalId || '').trim();
}

export function hasMatchingAuthPrincipal(
  expectedPrincipalId: string | null | undefined,
  session: AuthSession | null | undefined
): boolean {
  const expected = String(expectedPrincipalId || '').trim();
  return Boolean(expected && expected === getAuthSessionPrincipalId(session));
}
