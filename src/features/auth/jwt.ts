export const JWT_CLOCK_SKEW_SECONDS = 30;

export type OfflineAccessJwtClaims = {
  sub: string;
  typ: 'access';
  iat: number;
  exp: number;
};

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');

  if (typeof atob === 'function') {
    return atob(padded);
  }

  const maybeBuffer = (globalThis as unknown as { Buffer?: { from: (input: string, encoding: string) => { toString: (encoding: string) => string } } }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(padded, 'base64').toString('utf8');
  }

  throw new Error('Base64 decoding is unavailable in this runtime.');
}

function getJwtSegments(accessToken: string): [string, string, string] | null {
  const segments = String(accessToken || '').split('.');

  if (
    segments.length !== 3 ||
    segments.some((segment) => !segment || !/^[A-Za-z0-9_-]+$/.test(segment))
  ) {
    return null;
  }

  return segments as [string, string, string];
}

function decodeJwtObject(segment: string): Record<string, unknown> | null {
  try {
    const decoded = JSON.parse(base64UrlDecode(segment)) as unknown;
    return decoded && typeof decoded === 'object' && !Array.isArray(decoded)
      ? decoded as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function getJwtExpirySeconds(accessToken: string): number | null {
  const segments = getJwtSegments(accessToken);
  if (!segments) {
    return null;
  }

  const payload = decodeJwtObject(segments[1]);
  return typeof payload?.exp === 'number' && Number.isFinite(payload.exp)
    ? payload.exp
    : null;
}

export function getOfflineAccessJwtClaims(
  accessToken: string,
  nowSeconds = Date.now() / 1000,
  maxFutureIatSeconds = JWT_CLOCK_SKEW_SECONDS
): OfflineAccessJwtClaims | null {
  const segments = getJwtSegments(accessToken);
  if (!segments) {
    return null;
  }

  const header = decodeJwtObject(segments[0]);
  const payload = decodeJwtObject(segments[1]);
  if (!header || !payload) {
    return null;
  }

  const algorithm = typeof header.alg === 'string' ? header.alg.trim().toLowerCase() : '';
  const subject = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  const tokenType = typeof payload.typ === 'string' ? payload.typ.trim().toLowerCase() : '';
  const issuedAt = payload.iat;
  const expiresAt = payload.exp;
  const allowedFutureSeconds = Number.isFinite(maxFutureIatSeconds) && maxFutureIatSeconds >= 0
    ? maxFutureIatSeconds
    : JWT_CLOCK_SKEW_SECONDS;

  if (
    !algorithm ||
    algorithm === 'none' ||
    !subject ||
    tokenType !== 'access' ||
    typeof issuedAt !== 'number' ||
    !Number.isFinite(issuedAt) ||
    issuedAt < 0 ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= issuedAt ||
    !Number.isFinite(nowSeconds) ||
    issuedAt > nowSeconds + allowedFutureSeconds
  ) {
    return null;
  }

  return {
    sub: subject,
    typ: 'access',
    iat: issuedAt,
    exp: expiresAt
  };
}

export function isJwtExpired(
  accessToken: string,
  nowSeconds = Date.now() / 1000,
  clockSkewSeconds = JWT_CLOCK_SKEW_SECONDS
): boolean {
  const expirySeconds = getJwtExpirySeconds(accessToken);
  if (expirySeconds === null) {
    return false;
  }

  return expirySeconds <= nowSeconds + clockSkewSeconds;
}
