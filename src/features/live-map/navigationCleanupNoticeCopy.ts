export function createNavigationCleanupNoticeCopy({
  checking,
  workspaceName,
}: {
  checking: boolean;
  workspaceName?: string | null;
}): {
  accessibilityMessage: string;
  actionAccessibilityLabel: string;
  message: string;
} {
  const targetName = workspaceName?.trim() || "";
  if (targetName) {
    const visibleTargetName =
      targetName.length > 48
        ? `${targetName.slice(0, 47).trimEnd()}…`
        : targetName;
    return checking
      ? {
          accessibilityMessage:
            `Removing saved guidance before changing to ${targetName}.`,
          actionAccessibilityLabel: `Removing guidance before changing to ${targetName}`,
          message:
            `Removing saved guidance before changing to ${visibleTargetName}.`,
        }
      : {
          accessibilityMessage:
            `SafeRoute could not remove saved guidance. Retry to finish changing to ${targetName}.`,
          actionAccessibilityLabel: `Retry cleanup and change to ${targetName}`,
          message:
            `SafeRoute could not remove saved guidance. Retry to finish changing to ${visibleTargetName}.`,
        };
  }

  return checking
    ? {
        accessibilityMessage:
          "Removing saved guidance before another route can start.",
        actionAccessibilityLabel: "Removing saved guidance",
        message: "Removing saved guidance before another route can start.",
      }
    : {
        accessibilityMessage:
          "SafeRoute could not remove saved guidance. Retry before starting another route.",
        actionAccessibilityLabel: "Retry guidance cleanup",
        message:
          "SafeRoute could not remove saved guidance. Retry before starting another route.",
      };
}
