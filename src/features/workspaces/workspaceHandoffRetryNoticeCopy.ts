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
  targetAccessRestored = false,
  targetWorkspaceName,
}: {
  checkingAccess?: boolean;
  saving: boolean;
  sourceWorkspaceName?: string | null;
  targetAccessRestored?: boolean;
  targetWorkspaceName: string;
}): {
  accessibilityMessage: string;
  chooseAnotherAccessibilityLabel: string;
  chooseAnotherLabel: string;
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
      chooseAnotherAccessibilityLabel: sourceName
        ? `Choose a different workspace instead of ${targetName}. ${sourceName} remains active.`
        : `Choose a different workspace instead of ${targetName}.`,
      chooseAnotherLabel: "Choose another workspace",
      keepAccessibilityLabel: sourceName
        ? `Keep using ${sourceName} and discard the change to ${targetName}`
        : `Discard the change to ${targetName}`,
      keepLabel: sourceName ? `Keep ${visibleSource}` : "Discard change",
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
      chooseAnotherAccessibilityLabel: sourceName
        ? `Choose a different workspace instead of ${targetName}. ${sourceName} remains active.`
        : `Choose a different workspace instead of ${targetName}.`,
      chooseAnotherLabel: "Choose another workspace",
      keepAccessibilityLabel: sourceName
        ? `Keep using ${sourceName}`
        : `Discard the change to ${targetName}`,
      keepLabel: sourceName ? `Keep ${visibleSource}` : "Discard change",
      message: sourceName
        ? `Saving ${visibleTarget}. ${visibleSource} stays active until verified.`
        : `Saving ${visibleTarget}. The change stays hidden until verified.`,
      retryAccessibilityLabel: `Saving workspace ${targetName}`,
      retryLabel: "Saving…",
      title: "Saving workspace",
    };
  }

  if (targetAccessRestored) {
    return {
      accessibilityMessage: sourceName
        ? `Access to ${targetName} is restored. ${sourceName} remains active. Retry the workspace change, choose another workspace, or keep using ${sourceName}.`
        : `Access to ${targetName} is restored. Retry the workspace change or choose another workspace.`,
      chooseAnotherAccessibilityLabel: sourceName
        ? `Choose a different workspace instead of ${targetName}. ${sourceName} remains active.`
        : `Choose a different workspace instead of ${targetName}.`,
      chooseAnotherLabel: "Choose another workspace",
      keepAccessibilityLabel: sourceName
        ? `Keep using ${sourceName} and discard the change to ${targetName}`
        : `Discard the change to ${targetName}`,
      keepLabel: sourceName ? `Keep ${visibleSource}` : "Discard change",
      message: sourceName
        ? `${visibleTarget} is available again. Still using ${visibleSource}.`
        : `${visibleTarget} is available again.`,
      retryAccessibilityLabel: `Retry changing workspace to ${targetName}`,
      retryLabel: `Retry ${visibleTarget}`,
      title: "Workspace access restored",
    };
  }

  return {
    accessibilityMessage: sourceName
      ? `Route ended. Still using ${sourceName} because ${targetName} could not be saved. Retry the workspace change without choosing it again.`
      : `Route ended. ${targetName} could not be saved. Retry the workspace change without choosing it again.`,
    chooseAnotherAccessibilityLabel: sourceName
      ? `Choose a different workspace instead of ${targetName}. ${sourceName} remains active.`
      : `Choose a different workspace instead of ${targetName}.`,
    chooseAnotherLabel: "Choose another workspace",
    keepAccessibilityLabel: sourceName
      ? `Keep using ${sourceName} and discard the change to ${targetName}`
      : `Discard the change to ${targetName}`,
    keepLabel: sourceName ? `Keep ${visibleSource}` : "Discard change",
    message: sourceName
      ? `Route ended. Still using ${visibleSource} because ${visibleTarget} could not be saved.`
      : `Route ended. ${visibleTarget} could not be saved.`,
    retryAccessibilityLabel: `Retry changing workspace to ${targetName}`,
    retryLabel: `Retry ${visibleTarget}`,
    title: "Workspace change needed",
  };
}
