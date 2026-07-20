const VISIBLE_WORKSPACE_NAME_LIMIT = 40;

function visibleWorkspaceName(name: string): string {
  const normalized = name.trim();
  if (normalized.length <= VISIBLE_WORKSPACE_NAME_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, VISIBLE_WORKSPACE_NAME_LIMIT - 1).trimEnd()}…`;
}

export function createWorkspaceHandoffRetryNoticeCopy({
  checkingAccess,
  saving,
  sourceWorkspaceName,
  targetWorkspaceName,
}: {
  checkingAccess?: boolean;
  saving: boolean;
  sourceWorkspaceName?: string | null;
  targetWorkspaceName: string;
}): {
  accessibilityMessage: string;
  keepAccessibilityLabel: string;
  keepLabel: string;
  message: string;
  retryAccessibilityLabel: string;
  retryLabel: string;
  title: string;
} {
  const targetName = targetWorkspaceName.trim();
  const sourceName = sourceWorkspaceName?.trim() || "";
  const visibleTarget = visibleWorkspaceName(targetName);
  const visibleSource = visibleWorkspaceName(sourceName);

  if (checkingAccess) {
    return {
      accessibilityMessage: sourceName
        ? `Checking access to ${targetName}. ${sourceName} remains active while access is verified.`
        : `Checking access to ${targetName}. No workspace change will publish until access is verified.`,
      keepAccessibilityLabel: sourceName
        ? `Keep using ${sourceName} and discard the change to ${targetName}`
        : `Discard the change to ${targetName} and choose another workspace`,
      keepLabel: sourceName ? `Keep ${visibleSource}` : "Choose another",
      message: sourceName
        ? `Checking access to ${visibleTarget}. Still using ${visibleSource}.`
        : `Checking access to ${visibleTarget}. The change remains paused.`,
      retryAccessibilityLabel: `Checking access before retrying ${targetName}`,
      retryLabel: "Checking…",
      title: "Checking workspace access",
    };
  }

  if (saving) {
    return {
      accessibilityMessage: sourceName
        ? `Saving ${targetName}. ${sourceName} remains active until the workspace change is verified.`
        : `Saving ${targetName}. No workspace change will publish until the save is verified.`,
      keepAccessibilityLabel: sourceName
        ? `Keep using ${sourceName}`
        : "Choose another workspace",
      keepLabel: sourceName ? `Keep ${visibleSource}` : "Choose another",
      message: sourceName
        ? `Saving ${visibleTarget}. ${visibleSource} stays active until verified.`
        : `Saving ${visibleTarget}. The change stays hidden until verified.`,
      retryAccessibilityLabel: `Saving workspace ${targetName}`,
      retryLabel: "Saving…",
      title: "Saving workspace",
    };
  }

  return {
    accessibilityMessage: sourceName
      ? `Route ended. Still using ${sourceName} because ${targetName} could not be saved. Retry the workspace change without choosing it again.`
      : `Route ended. ${targetName} could not be saved. Retry the workspace change without choosing it again.`,
    keepAccessibilityLabel: sourceName
      ? `Keep using ${sourceName} and discard the change to ${targetName}`
      : `Discard the change to ${targetName} and choose another workspace`,
    keepLabel: sourceName ? `Keep ${visibleSource}` : "Choose another",
    message: sourceName
      ? `Route ended. Still using ${visibleSource} because ${visibleTarget} could not be saved.`
      : `Route ended. ${visibleTarget} could not be saved.`,
    retryAccessibilityLabel: `Retry changing workspace to ${targetName}`,
    retryLabel: `Retry ${visibleTarget}`,
    title: "Workspace change needed",
  };
}
