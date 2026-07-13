import { ApiRequestError, ApiSessionExpiredError, parseJsonResponse } from '../api/apiClientCore';
import { getAuthErrorMessage } from './authPayload';

export async function assertAuthResponseOk(response: Response, fallbackMessage: string): Promise<unknown> {
  const body = await parseJsonResponse(response);
  const message = getAuthErrorMessage(body, fallbackMessage);

  if (response.status === 401 || response.status === 403) {
    throw new ApiSessionExpiredError(message);
  }

  if (!response.ok) {
    throw new ApiRequestError(message, response.status);
  }

  return body;
}
