const PENDING_INVITATION_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

interface StoredAccountInvitationToken {
  storedAtMs: number;
  token: string;
  version: 1;
}

export function serializeAccountInvitationToken(
  token: string,
  nowMs = Date.now()
): string {
  const normalizedToken = token.trim();
  if (normalizedToken.length < 8 || normalizedToken.length > 2048) {
    return '';
  }

  return JSON.stringify({
    storedAtMs: nowMs,
    token: normalizedToken,
    version: 1,
  } satisfies StoredAccountInvitationToken);
}

export function parseAccountInvitationToken(
  value: string | null | undefined,
  nowMs = Date.now()
): string {
  if (!value) {
    return '';
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredAccountInvitationToken>;
    const token = typeof parsed.token === 'string' ? parsed.token.trim() : '';
    const storedAtMs = Number(parsed.storedAtMs);
    const ageMs = nowMs - storedAtMs;

    if (
      parsed.version !== 1 ||
      token.length < 8 ||
      token.length > 2048 ||
      !Number.isFinite(storedAtMs) ||
      ageMs < -MAX_CLOCK_SKEW_MS ||
      ageMs > PENDING_INVITATION_MAX_AGE_MS
    ) {
      return '';
    }

    return token;
  } catch {
    return '';
  }
}
