export interface LoginNoticeState {
  accessibilityLabel: string | null;
  message: string;
}

export const LOGIN_NOTICE_MESSAGE_MAX_LENGTH = 72;

export function createLoginNoticeState(message: string): LoginNoticeState | null {
  const normalizedMessage = normalizeLoginNoticeMessage(message);

  if (!normalizedMessage) {
    return null;
  }

  const compactMessage = createCompactLoginNoticeText(normalizedMessage);

  return {
    accessibilityLabel: compactMessage === normalizedMessage ? null : normalizedMessage,
    message: compactMessage
  };
}

export function createCompactLoginNoticeText(
  message: string,
  maxLength = LOGIN_NOTICE_MESSAGE_MAX_LENGTH
): string {
  const normalizedMessage = normalizeLoginNoticeMessage(message);

  if (!normalizedMessage || normalizedMessage.length <= maxLength) {
    return normalizedMessage;
  }

  return `${normalizedMessage.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeLoginNoticeMessage(message: string): string {
  return String(message || '').replace(/\s+/g, ' ').trim();
}
