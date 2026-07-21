export interface SessionNoticeState {
  accessibilityLabel: string | null;
  accessibilityRole: "alert" | undefined;
  message: string;
}

export const SESSION_NOTICE_MESSAGE_MAX_LENGTH = 84;

export function createSessionNoticeState(
  message?: string | null,
): SessionNoticeState | null {
  const normalizedMessage = normalizeSessionNoticeMessage(message);

  if (!normalizedMessage) {
    return null;
  }

  const compactMessage = createCompactSessionNoticeMessage(normalizedMessage);

  return {
    accessibilityLabel:
      compactMessage === normalizedMessage ? null : normalizedMessage,
    accessibilityRole: isSeparatelyAnnouncedWorkspaceConfirmation(normalizedMessage)
      ? undefined
      : "alert",
    message: compactMessage,
  };
}

export function createCompactSessionNoticeMessage(message: string): string {
  const normalizedMessage = normalizeSessionNoticeMessage(message);

  if (normalizedMessage.length <= SESSION_NOTICE_MESSAGE_MAX_LENGTH) {
    return normalizedMessage;
  }

  return `${normalizedMessage
    .slice(0, Math.max(0, SESSION_NOTICE_MESSAGE_MAX_LENGTH - 1))
    .trimEnd()}…`;
}

function normalizeSessionNoticeMessage(message?: string | null): string {
  return String(message || "")
    .trim()
    .replace(/\s+/g, " ");
}

function isSeparatelyAnnouncedWorkspaceConfirmation(message: string): boolean {
  return (
    message === "Workspace access refreshed." ||
    message === "Workspace access verified."
  );
}
