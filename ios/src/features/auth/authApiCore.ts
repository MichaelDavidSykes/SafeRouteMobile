import {
  ApiRequestError,
  ApiSessionExpiredError,
  LUNARCHAIN_INACTIVE_ACCOUNT_MESSAGE,
  isInactiveAccountResponse,
  parseJsonResponse,
} from '../api/apiClientCore';
import { getAuthErrorMessage } from './authPayload';

export const ACCOUNT_ALREADY_EXISTS_MESSAGE =
  'An account already exists for this email. Sign in instead.';

export class AccountAlreadyExistsError extends ApiRequestError {
  constructor(statusCode = 409) {
    super(ACCOUNT_ALREADY_EXISTS_MESSAGE, statusCode);
    this.name = 'AccountAlreadyExistsError';
  }
}

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

  if (isAccountAlreadyExistsResponse(response.status, body)) {
    throw new AccountAlreadyExistsError(response.status);
  }

  if (!response.ok) {
    throw new ApiRequestError(message, response.status);
  }

  return body;
}

export function isAccountAlreadyExistsResponse(
  statusCode: number,
  responseBody: unknown
): boolean {
  if (statusCode !== 400 && statusCode !== 409) {
    return false;
  }

  const body = responseBody as {
    code?: unknown;
    detail?: { code?: unknown } | unknown;
  } | null | undefined;
  const detail = body?.detail && typeof body.detail === 'object' && !Array.isArray(body.detail)
    ? body.detail as { code?: unknown }
    : undefined;
  const contractCode = String(detail?.code || body?.code || '').trim().toLowerCase();
  if (contractCode === 'account_exists') {
    return true;
  }

  const message = getAuthErrorMessage(responseBody, '').trim().toLowerCase();
  return message === 'user already exists' ||
    message === 'a user with this email already exists' ||
    message === ACCOUNT_ALREADY_EXISTS_MESSAGE.toLowerCase();
}
