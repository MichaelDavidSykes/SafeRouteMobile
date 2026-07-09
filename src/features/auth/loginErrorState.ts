export interface LoginErrorState {
  message: string;
  accessibilityLabel: string | null;
}

export const LOGIN_ERROR_MESSAGE_MAX_LENGTH = 84;

export function createLoginErrorState(message: string): LoginErrorState | null {
  const normalizedMessage = normalizeLoginErrorMessage(message);

  if (!normalizedMessage) {
    return null;
  }

  const compactMessage = createCompactLoginErrorText(normalizedMessage);

  return {
    message: compactMessage,
    accessibilityLabel: compactMessage === normalizedMessage ? null : normalizedMessage
  };
}

export function createCompactLoginErrorText(
  message: string,
  maxLength = LOGIN_ERROR_MESSAGE_MAX_LENGTH
): string {
  const normalizedMessage = normalizeLoginErrorMessage(message);

  if (!normalizedMessage || normalizedMessage.length <= maxLength) {
    return normalizedMessage;
  }

  return `${normalizedMessage.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeLoginErrorMessage(message: string): string {
  return String(message || '').replace(/\s+/g, ' ').trim();
}
