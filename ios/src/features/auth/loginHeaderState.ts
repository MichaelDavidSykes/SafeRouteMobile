export type LoginHeaderState = {
  eyebrow: string;
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

const SIGN_IN_SUBTITLE = "Use your LunarChain account to continue to SafeRoute.";
const FALLBACK_CHALLENGE_SUBTITLE = "Enter the six-digit code sent to your account.";
export const LOGIN_CHALLENGE_SUBTITLE_MAX_LENGTH = 96;

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
      eyebrow: "Two-factor verification",
      subtitle: compactSubtitle,
      subtitleAccessibilityLabel:
        compactSubtitle === subtitle ? null : subtitle,
      title: "Enter your login code",
      titleAccessibilityLabel: "Enter LunarChain login code",
    };
  }

  return {
    eyebrow: "Sign in",
    subtitle: SIGN_IN_SUBTITLE,
    subtitleAccessibilityLabel: null,
    title: "Log in to LunarChain",
    titleAccessibilityLabel: compact
      ? `Log in to LunarChain. ${SIGN_IN_SUBTITLE}`
      : "Log in to LunarChain",
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
