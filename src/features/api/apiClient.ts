import { LUNARCHAIN_API_BASE } from '../../config/env';
import {
  ApiAuthorizationError,
  ApiRequestError,
  ApiSessionExpiredError,
  createApiResponseError,
  createNetworkRequestError,
  fetchWithTimeout,
  getApiAuthorizationMessage,
  getApiErrorMessage,
  getApiSessionExpiredMessage,
  unwrapApiEnvelope,
  type SafeRouteRequestOptions
} from './apiClientCore';

export {
  ApiAuthorizationError,
  ApiRequestError,
  ApiSessionExpiredError,
  createApiResponseError,
  createNetworkRequestError,
  fetchWithTimeout,
  getApiAuthorizationMessage,
  getApiErrorMessage,
  getApiSessionExpiredMessage,
  unwrapApiEnvelope
};

export async function parseJsonResponse(response: Response): Promise<unknown> {
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

export async function apiRequest<T>(
  path: string,
  accessToken: string,
  options: SafeRouteRequestOptions = {}
): Promise<T> {
  let response: Response;

  try {
    response = await fetchWithTimeout(`${LUNARCHAIN_API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
        Authorization: `Bearer ${accessToken}`
      }
    });
  } catch {
    throw createNetworkRequestError();
  }

  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw createApiResponseError(response.status, body);
  }

  return unwrapApiEnvelope<T>(body);
}
