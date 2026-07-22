import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createLoginHeaderState,
  LOGIN_CHALLENGE_SUBTITLE_MAX_LENGTH,
} from "../src/features/auth/loginHeaderState";

describe("login header state", () => {
  it("keeps regular sign-in header context visible", () => {
    assert.deepEqual(
      createLoginHeaderState({
        challengeActive: false,
        compact: false,
      }),
      {
        eyebrow: "Sign in",
        subtitle: "Use your LunarChain account to continue to SafeRoute.",
        subtitleAccessibilityLabel: null,
        title: "Log in to LunarChain",
        titleAccessibilityLabel: "Log in to LunarChain",
      },
    );
  });

  it("keeps essential sign-in context visible on compact iPhones", () => {
    assert.deepEqual(
      createLoginHeaderState({
        challengeActive: false,
        compact: true,
      }),
      {
        eyebrow: "Sign in",
        subtitle: "Use your LunarChain account to continue to SafeRoute.",
        subtitleAccessibilityLabel: null,
        title: "Log in to LunarChain",
        titleAccessibilityLabel:
          "Log in to LunarChain. Use your LunarChain account to continue to SafeRoute.",
      },
    );
  });

  it("keeps two-factor delivery context visible even in compact mode", () => {
    assert.deepEqual(
      createLoginHeaderState({
        challengeActive: true,
        challengeSubtitle: "Code sent to driver@example.com.",
        compact: true,
      }),
      {
        eyebrow: "Two-factor verification",
        subtitle: "Code sent to driver@example.com.",
        subtitleAccessibilityLabel: null,
        title: "Enter your login code",
        titleAccessibilityLabel: "Enter LunarChain login code",
      },
    );
  });

  it("falls back to safe two-factor guidance when the challenge subtitle is blank", () => {
    assert.deepEqual(
      createLoginHeaderState({
        challengeActive: true,
        challengeSubtitle: "  ",
        compact: false,
      }),
      {
        eyebrow: "Two-factor verification",
        subtitle: "Enter the six-digit code sent to your account.",
        subtitleAccessibilityLabel: null,
        title: "Enter your login code",
        titleAccessibilityLabel: "Enter LunarChain login code",
      },
    );
  });

  it("bounds long two-factor subtitles while keeping full delivery context accessible", () => {
    const subtitle =
      "We sent a code to a.very.long.safe-route-operator.alias@example-security-operations.invalid. Enter it to finish signing in.";
    const compactSubtitle = `${subtitle
      .slice(0, LOGIN_CHALLENGE_SUBTITLE_MAX_LENGTH - 1)
      .trimEnd()}…`;

    assert.deepEqual(
      createLoginHeaderState({
        challengeActive: true,
        challengeSubtitle: `  ${subtitle}  `,
        compact: true,
      }),
      {
        eyebrow: "Two-factor verification",
        subtitle: compactSubtitle,
        subtitleAccessibilityLabel: subtitle,
        title: "Enter your login code",
        titleAccessibilityLabel: "Enter LunarChain login code",
      },
    );
  });
});
