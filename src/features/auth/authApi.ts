import { LUNARCHAIN_API_BASE } from '../../config/env';
import { fetchWithTimeout, type SafeRouteRequestOptions } from '../api/apiClientCore';
import type { AuthSession, AuthenticatedUser, PasswordLoginResult } from './authTypes';
import { assertAuthResponseOk } from './authApiCore';
import { buildMobileAuthHeaders, buildPasswordLoginBody, normalizeEmail, unwrapAuthData } from './authPayload';

async function fetchAuthResponse(url: string, options: SafeRouteRequestOptions): Promise<Response> {
  return fetchWithTimeout(url, options);
}

export async function loginWithPassword(email: string, password: string): Promise<PasswordLoginResult> {
  const normalizedEmail = normalizeEmail(email);
  const response = await fetchAuthResponse(`${LUNARCHAIN_API_BASE}/auth/login`, {
    method: 'POST',
    headers: buildMobileAuthHeaders('application/x-www-form-urlencoded'),
    body: buildPasswordLoginBody(normalizedEmail, password)
  });

  const body = await assertAuthResponseOk(response, 'Unable to sign in with those credentials.');
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
    headers: buildMobileAuthHeaders('application/json'),
    body: JSON.stringify({
      email: normalizeEmail(email),
      challenge_token: challengeToken,
      code: String(code || '').trim()
    })
  });

  const body = await assertAuthResponseOk(response, 'Unable to verify the login code.');
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

  const body = await assertAuthResponseOk(response, 'Unable to validate the saved session.');
  const payload = unwrapAuthData(body) as { email?: string; sub?: string; name?: string };
  const email = normalizeEmail(payload.email || payload.sub || '');

  return {
    email,
    name: payload.name
  };
}
