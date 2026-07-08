import { LUNARCHAIN_API_BASE } from '../../config/env';
import {
  ApiRequestError,
  ApiSessionExpiredError,
  createNetworkRequestError,
  getApiErrorMessage,
  unwrapApiEnvelope
} from './apiClientCore';

export { ApiRequestError, ApiSessionExpiredError, createNetworkRequestError, getApiErrorMessage, unwrapApiEnvelope };

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
  options: RequestInit = {}
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${LUNARCHAIN_API_BASE}${path}`, {
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

  if (response.status === 401 || response.status === 403) {
    throw new ApiSessionExpiredError(getApiErrorMessage(body, 'Your LunarChain session expired. Sign in again.'));
  }

  if (!response.ok) {
    throw new ApiRequestError(getApiErrorMessage(body, 'Unable to reach LunarChain.'), response.status);
  }

  return unwrapApiEnvelope<T>(body);
}
