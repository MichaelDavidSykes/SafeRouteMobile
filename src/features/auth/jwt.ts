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

export function getJwtExpirySeconds(accessToken: string): number | null {
  const [, payload] = String(accessToken || '').split('.');
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as { exp?: unknown };
    return typeof parsed.exp === 'number' && Number.isFinite(parsed.exp) ? parsed.exp : null;
  } catch {
    return null;
  }
}

export function isJwtExpired(accessToken: string, nowSeconds = Date.now() / 1000, clockSkewSeconds = 30): boolean {
  const expirySeconds = getJwtExpirySeconds(accessToken);
  if (expirySeconds === null) {
    return false;
  }

  return expirySeconds <= nowSeconds + clockSkewSeconds;
}
