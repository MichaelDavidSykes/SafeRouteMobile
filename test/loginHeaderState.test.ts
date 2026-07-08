import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLoginHeaderState } from "../src/features/auth/loginHeaderState";

describe("login header state", () => {
  it("keeps regular sign-in header context visible", () => {
    assert.deepEqual(
      createLoginHeaderState({
        challengeActive: false,
        compact: false,
      }),
      {
        subtitle: "Sync saved routes to the map.",
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
        title: "Enter code",
        titleAccessibilityLabel: "Enter LunarChain login code",
      },
    );
  });
});
