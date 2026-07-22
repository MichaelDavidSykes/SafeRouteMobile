import {
  ApiRequestError,
  ApiSessionExpiredError,
  LUNARCHAIN_INACTIVE_ACCOUNT_MESSAGE,
  isInactiveAccountResponse,
  parseJsonResponse,
} from '../api/apiClientCore';
import { getAuthErrorMessage } from './authPayload';

export async function assertAuthResponseOk(response: Response, fallbackMessage: string): Promise<unknown> {
  const body = await parseJsonResponse(response);
  const message = getAuthErrorMessage(body, fallbackMessage);
  const inactiveAccount = isInactiveAccountResponse(response.status, body);

  if (
    response.status === 401 ||
    response.status === 403 ||
    inactiveAccount
  ) {
    throw new ApiSessionExpiredError(
      inactiveAccount
        ? LUNARCHAIN_INACTIVE_ACCOUNT_MESSAGE
        : message,
      inactiveAccount ? 'inactive-account' : 'session-expired',
    );
  }

  if (!response.ok) {
    throw new ApiRequestError(message, response.status);
  }

  return body;
}

export async function assertPublicAuthResponseOk(
  response: Response,
  fallbackMessage: string
): Promise<unknown> {
  const body = await parseJsonResponse(response);
  const message = getAuthErrorMessage(body, fallbackMessage);

  if (!response.ok) {
    throw new ApiRequestError(message, response.status);
  }

  return body;
}
