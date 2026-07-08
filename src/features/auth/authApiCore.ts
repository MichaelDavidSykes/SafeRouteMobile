import { ApiRequestError, ApiSessionExpiredError } from '../api/apiClientCore';
import { getAuthErrorMessage } from './authPayload';

export async function parseAuthJsonResponse(response: Response): Promise<unknown> {
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

export async function assertAuthResponseOk(response: Response, fallbackMessage: string): Promise<unknown> {
  const body = await parseAuthJsonResponse(response);
  const message = getAuthErrorMessage(body, fallbackMessage);

  if (response.status === 401 || response.status === 403) {
    throw new ApiSessionExpiredError(message);
  }

  if (!response.ok) {
    throw new ApiRequestError(message, response.status);
  }

  return body;
}
