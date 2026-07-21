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
        subtitle: "Sync saved routes to the map.",
        subtitleAccessibilityLabel: null,
        title: "Sign in",
        titleAccessibilityLabel: "Sign in",
      },
    );
  });

  it("hides secondary sign-in copy on compact iPhones but keeps it for VoiceOver", () => {
    assert.deepEqual(
      createLoginHeaderState({
        challengeActive: false,
        compact: true,
      }),
      {
        subtitle: null,
        subtitleAccessibilityLabel: null,
        title: "Sign in",
        titleAccessibilityLabel: "Sign in. Sync saved routes to the map.",
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
        subtitle: "Code sent to driver@example.com.",
        subtitleAccessibilityLabel: null,
        title: "Enter code",
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
        subtitle: "Enter the six-digit LunarChain login code.",
        subtitleAccessibilityLabel: null,
        title: "Enter code",
        titleAccessibilityLabel: "Enter LunarChain login code",
      },
    );
  });

  it("bounds long two-factor subtitles while keeping full delivery context accessible", () => {
    const subtitle =
      "Code sent to a.very.long.safe-route-operator.alias@example-security-operations.invalid.";
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
        subtitle: compactSubtitle,
        subtitleAccessibilityLabel: subtitle,
        title: "Enter code",
        titleAccessibilityLabel: "Enter LunarChain login code",
      },
    );
  });
});
