export type SuspendedNavigationStatus = "checking" | "paused";

export interface SuspendedNavigationPresentation {
  message: string;
  retryLabel: string;
  title: string;
}

export function createSuspendedNavigationPresentation({
  offline,
  status,
}: {
  offline: boolean;
  status: SuspendedNavigationStatus;
}): SuspendedNavigationPresentation {
  if (status === "checking") {
    return {
      message: "Guidance stays off until this workspace is verified.",
      retryLabel: "Checking…",
      title: "Checking workspace access",
    };
  }
  return {
    message: offline
      ? "Reconnect to verify access before guidance can resume."
      : "Workspace access could not be verified. Retry when ready.",
    retryLabel: "Retry access",
    title: "Guidance paused",
  };
}
