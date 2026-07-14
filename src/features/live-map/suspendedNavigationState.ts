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
      message: "Confirming this saved route is ready to resume.",
      retryLabel: "Restoring…",
      title: "Restoring route",
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
