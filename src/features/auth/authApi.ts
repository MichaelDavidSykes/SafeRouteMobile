import { LUNARCHAIN_API_BASE } from '../../config/env';
import { ApiSessionExpiredError, createNetworkRequestError } from '../api/apiClientCore';
import type { AuthSession, AuthenticatedUser, PasswordLoginResult } from './authTypes';
import { buildPasswordLoginBody, getAuthErrorMessage, normalizeEmail, unwrapAuthData } from './authPayload';

async function fetchAuthResponse(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch {
    throw createNetworkRequestError();
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function assertOk(response: Response, fallbackMessage: string): Promise<unknown> {
  const body = await parseJson(response);
  const message = getAuthErrorMessage(body, fallbackMessage);

  if (response.status === 401 || response.status === 403) {
    throw new ApiSessionExpiredError(message);
  }

  if (!response.ok) {
    throw new Error(message);
  }

  return body;
}

export async function loginWithPassword(email: string, password: string): Promise<PasswordLoginResult> {
  const normalizedEmail = normalizeEmail(email);
  const response = await fetchAuthResponse(`${LUNARCHAIN_API_BASE}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: buildPasswordLoginBody(normalizedEmail, password)
  });

  const body = await assertOk(response, 'Unable to sign in with those credentials.');
  const payload = unwrapAuthData(body);

  if (payload.requires_two_factor) {
    const challengeToken = String(payload.challenge_token || '').trim();
    if (!challengeToken) {
      throw new Error('Login requires verification, but no challenge token was returned.');
    }

    return {
      status: 'two-factor',
      challenge: {
        email: normalizedEmail,
        challengeToken,
        method: payload.two_factor_method || 'email',
        expiresAt: payload.expires_at
      }
    };
  }

  const accessToken = String(payload.access_token || '').trim();
  if (!accessToken) {
    throw new Error('Login failed: no access token returned.');
  }

  return {
    status: 'authenticated',
    session: {
      accessToken,
      email: normalizeEmail(payload.email || normalizedEmail)
    }
  };
}

export async function verifyLoginCode(email: string, challengeToken: string, code: string): Promise<AuthSession> {
  const response = await fetchAuthResponse(`${LUNARCHAIN_API_BASE}/auth/verify-login-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: normalizeEmail(email),
      challenge_token: challengeToken,
      code: String(code || '').trim()
    })
  });

  const body = await assertOk(response, 'Unable to verify the login code.');
  const payload = unwrapAuthData(body);
  const accessToken = String(payload.access_token || '').trim();

  if (!accessToken) {
    throw new Error('Login failed: no access token returned.');
  }

  return {
    accessToken,
    email: normalizeEmail(payload.email || email)
  };
}

export async function getCurrentUser(accessToken: string): Promise<AuthenticatedUser> {
  const response = await fetchAuthResponse(`${LUNARCHAIN_API_BASE}/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const body = await assertOk(response, 'Unable to validate the saved session.');
  const payload = unwrapAuthData(body) as { email?: string; sub?: string; name?: string };
  const email = normalizeEmail(payload.email || payload.sub || '');

  return {
    email,
    name: payload.name
  };
}
