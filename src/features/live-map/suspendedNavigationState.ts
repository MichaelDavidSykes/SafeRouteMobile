import type { NetworkAvailabilityStatus } from "../api/networkAvailabilityState";

export type SuspendedNavigationStatus = "checking" | "paused";

export interface SuspendedNavigationPresentation {
  message: string;
  retryAccessibilityLabel: string;
  retryBusy: boolean;
  retryLabel: string;
  title: string;
}

export function createSuspendedNavigationPresentation({
  networkStatus,
  status,
}: {
  networkStatus: NetworkAvailabilityStatus;
  status: SuspendedNavigationStatus;
}): SuspendedNavigationPresentation {
  if (networkStatus === "checking") {
    return {
      message: "Checking connection before verifying this saved route.",
      retryAccessibilityLabel:
        "Checking connection before retrying workspace access",
      retryBusy: true,
      retryLabel: "Waiting…",
      title: "Checking connection",
    };
  }
  if (status === "checking") {
    if (networkStatus === "offline") {
      return {
        message: "Reconnect to continue verifying this saved route.",
        retryAccessibilityLabel:
          "Reconnect before retrying workspace access",
        retryBusy: false,
        retryLabel: "Reconnect",
        title: "Guidance paused",
      };
    }
    return {
      message: "Confirming this saved route is ready to resume.",
      retryAccessibilityLabel: "Restoring saved route",
      retryBusy: true,
      retryLabel: "Restoring…",
      title: "Restoring route",
    };
  }
  return {
    message: networkStatus === "offline"
      ? "Reconnect to verify access before guidance can resume."
      : "Workspace access could not be verified. Retry when ready.",
    retryAccessibilityLabel: networkStatus === "offline"
      ? "Reconnect before retrying workspace access"
      : "Retry workspace access",
    retryBusy: false,
    retryLabel: "Retry access",
    title: "Guidance paused",
  };
}
