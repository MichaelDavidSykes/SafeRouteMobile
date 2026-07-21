import type { BackgroundNavigationStatus } from "./backgroundNavigation";

export interface BackgroundNavigationPresentation {
  accessibilityLabel: string;
  actionLabel: string;
  message: string;
}

export function createBackgroundNavigationPresentation({
  navigationActive,
  status,
}: {
  navigationActive: boolean;
  status: BackgroundNavigationStatus;
}): BackgroundNavigationPresentation | null {
  if (
    !navigationActive ||
    status === "active" ||
    status === "checking" ||
    status === "idle" ||
    status === "requesting" ||
    status === "unsupported"
  ) {
    return null;
  }

  if (status === "denied") {
    return {
      accessibilityLabel:
        "Background guidance is off. Review location access to keep guidance active when the screen locks.",
      actionLabel: "Review access",
      message: "Background guidance is off",
    };
  }

  if (status === "error") {
    return {
      accessibilityLabel:
        "Background guidance is unavailable. Try enabling it again.",
      actionLabel: "Retry",
      message: "Background guidance unavailable",
    };
  }

  return {
    accessibilityLabel:
      "Keep SafeRoute guidance active when the screen locks.",
    actionLabel: "Keep active",
    message: "Continue with screen locked",
  };
}
