export type LoginHeaderState = {
  subtitle: string | null;
  title: string;
  titleAccessibilityLabel: string;
};

export type LoginHeaderStateInput = {
  challengeActive: boolean;
  challengeSubtitle?: string;
  compact: boolean;
};

const SIGN_IN_SUBTITLE = "Sync saved routes to the map.";
const FALLBACK_CHALLENGE_SUBTITLE = "Enter the six-digit LunarChain login code.";

export function createLoginHeaderState({
  challengeActive,
  challengeSubtitle = "",
  compact,
}: LoginHeaderStateInput): LoginHeaderState {
  if (challengeActive) {
    const subtitle = challengeSubtitle.trim() || FALLBACK_CHALLENGE_SUBTITLE;

    return {
      subtitle,
      title: "Enter code",
      titleAccessibilityLabel: "Enter LunarChain login code",
    };
  }

  return {
    subtitle: compact ? null : SIGN_IN_SUBTITLE,
    title: "Sign in",
    titleAccessibilityLabel: compact
      ? `Sign in. ${SIGN_IN_SUBTITLE}`
      : "Sign in",
  };
}
