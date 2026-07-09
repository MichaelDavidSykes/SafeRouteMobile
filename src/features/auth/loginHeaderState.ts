export type LoginHeaderState = {
  subtitle: string | null;
  subtitleAccessibilityLabel: string | null;
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
export const LOGIN_CHALLENGE_SUBTITLE_MAX_LENGTH = 64;

export function createLoginHeaderState({
  challengeActive,
  challengeSubtitle = "",
  compact,
}: LoginHeaderStateInput): LoginHeaderState {
  if (challengeActive) {
    const subtitle =
      normalizeLoginHeaderCopy(challengeSubtitle) || FALLBACK_CHALLENGE_SUBTITLE;
    const compactSubtitle = createCompactLoginHeaderCopy(
      subtitle,
      LOGIN_CHALLENGE_SUBTITLE_MAX_LENGTH,
    );

    return {
      subtitle: compactSubtitle,
      subtitleAccessibilityLabel:
        compactSubtitle === subtitle ? null : subtitle,
      title: "Enter code",
      titleAccessibilityLabel: "Enter LunarChain login code",
    };
  }

  return {
    subtitle: compact ? null : SIGN_IN_SUBTITLE,
    subtitleAccessibilityLabel: null,
    title: "Sign in",
    titleAccessibilityLabel: compact
      ? `Sign in. ${SIGN_IN_SUBTITLE}`
      : "Sign in",
  };
}

function normalizeLoginHeaderCopy(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function createCompactLoginHeaderCopy(
  value: string,
  maxLength: number,
): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
