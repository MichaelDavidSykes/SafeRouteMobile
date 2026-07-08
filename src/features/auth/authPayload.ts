interface AuthResponseData {
  access_token?: string;
  email?: string;
  requires_two_factor?: boolean;
  challenge_token?: string;
  two_factor_method?: string;
  expires_at?: string;
}

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function buildPasswordLoginBody(email: string, password: string): string {
  const formData = new URLSearchParams();
  formData.append('username', normalizeEmail(email));
  formData.append('password', password);
  return formData.toString();
}

export function unwrapAuthData(responseBody: unknown): AuthResponseData {
  const body = responseBody as { data?: AuthResponseData } | AuthResponseData | null | undefined;
  return ((body && 'data' in body ? body.data : body) || {}) as AuthResponseData;
}

export function getAuthErrorMessage(responseBody: unknown, fallback: string): string {
  const body = responseBody as {
    detail?: { details?: string; message?: string } | string;
    details?: string;
    message?: string;
  } | null | undefined;

  if (typeof body?.detail === 'string') {
    return firstNonEmptyMessage(body.detail, fallback);
  }

  if (body?.detail && typeof body.detail === 'object') {
    return firstNonEmptyMessage(body.detail.details, body.detail.message, fallback);
  }

  return firstNonEmptyMessage(body?.details, body?.message, fallback);
}

function firstNonEmptyMessage(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const message = typeof candidate === 'string' ? candidate.trim() : '';
    if (message) {
      return message;
    }
  }

  return candidates[candidates.length - 1] || 'Unable to complete LunarChain authentication.';
}
