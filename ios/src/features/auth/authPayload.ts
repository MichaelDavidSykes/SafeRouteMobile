interface AuthResponseData {
  access_token?: string;
  email?: string;
  requires_two_factor?: boolean;
  challenge_token?: string;
  two_factor_method?: string;
  expires_at?: string;
}

export interface AccountRegistrationPayload {
  email: string;
  first_name: string;
  invite_token: string;
  last_name: string;
  password: string;
  username: string;
}

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function buildAuthContentHeaders(contentType: string): Record<string, string> {
  return {
    'Content-Type': contentType
  };
}

export function buildPasswordLoginBody(email: string, password: string): string {
  const formData = new URLSearchParams();
  formData.append('username', normalizeEmail(email));
  formData.append('password', password);
  return formData.toString();
}

export function buildLoginCodePayload(
  email: string,
  challengeToken: string,
  code: string
) {
  return {
    challenge_token: challengeToken,
    code: String(code || '').trim(),
    email: normalizeEmail(email),
  };
}

export function buildLoginCodeResendPayload(email: string, challengeToken: string) {
  return {
    challenge_token: challengeToken,
    email: normalizeEmail(email),
  };
}

export function buildPasswordResetRequestPayload(email: string) {
  return { email: normalizeEmail(email) };
}

export function buildPasswordResetPayload(
  email: string,
  code: string,
  newPassword: string
) {
  return {
    code: String(code || '').trim(),
    email: normalizeEmail(email),
    new_password: newPassword,
  };
}

export function buildAccountRegistrationPayload({
  email,
  firstName,
  invitationToken,
  lastName,
  password,
}: {
  email: string;
  firstName: string;
  invitationToken: string;
  lastName: string;
  password: string;
}): AccountRegistrationPayload {
  const normalizedEmail = normalizeEmail(email);

  return {
    email: normalizedEmail,
    first_name: firstName.trim(),
    invite_token: invitationToken.trim(),
    last_name: lastName.trim(),
    password,
    username: normalizedEmail,
  };
}

export function buildAccountVerificationPayload(
  email: string,
  code: string,
  invitationToken: string
) {
  return {
    code: String(code || '').trim(),
    email: normalizeEmail(email),
    invite_token: invitationToken.trim(),
  };
}

export function unwrapAuthData(responseBody: unknown): AuthResponseData {
  const body = responseBody as { data?: AuthResponseData } | AuthResponseData | null | undefined;
  return ((body && 'data' in body ? body.data : body) || {}) as AuthResponseData;
}

export function getAuthErrorMessage(responseBody: unknown, fallback: string): string {
  const body = responseBody as {
    detail?: { details?: string; message?: string; msg?: string } | unknown[] | string;
    details?: string;
    error?: { details?: string; message?: string; msg?: string } | string;
    message?: string;
  } | null | undefined;

  return firstNonEmptyMessage(
    extractErrorMessage(body?.detail),
    body?.details,
    body?.message,
    extractErrorMessage(body?.error),
    fallback
  ) || fallback;
}

function firstNonEmptyMessage(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    const message = typeof candidate === 'string' ? candidate.trim() : '';
    if (message) {
      return message;
    }
  }

  return candidates[candidates.length - 1];
}

function extractErrorMessage(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = extractErrorMessage(item);
      if (message?.trim()) {
        return message;
      }
    }

    return undefined;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const error = value as {
    details?: unknown;
    error?: unknown;
    message?: unknown;
    msg?: unknown;
  };

  return firstNonEmptyMessage(
    typeof error.details === 'string' ? error.details : extractErrorMessage(error.details),
    typeof error.message === 'string' ? error.message : extractErrorMessage(error.message),
    typeof error.msg === 'string' ? error.msg : extractErrorMessage(error.msg),
    typeof error.error === 'string' ? error.error : extractErrorMessage(error.error)
  );
}
