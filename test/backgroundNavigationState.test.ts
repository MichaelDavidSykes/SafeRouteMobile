import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createBackgroundNavigationPresentation } from "../src/features/live-map/backgroundNavigationState";

describe("background navigation presentation", () => {
  it("stays hidden outside active navigation and after background tracking starts", () => {
    assert.equal(
      createBackgroundNavigationPresentation({
        navigationActive: false,
        status: "permission-required",
      }),
      null,
    );
    assert.equal(
      createBackgroundNavigationPresentation({
        navigationActive: true,
        status: "active",
      }),
      null,
    );
    assert.equal(
      createBackgroundNavigationPresentation({
        navigationActive: true,
        status: "unsupported",
      }),
      null,
    );
  });

  it("offers one concise action when permission is required", () => {
    assert.deepEqual(
      createBackgroundNavigationPresentation({
        navigationActive: true,
        status: "permission-required",
      }),
      {
        accessibilityLabel:
          "Keep SafeRoute guidance active when the screen locks.",
        actionLabel: "Keep active",
        message: "Continue with screen locked",
      },
    );
  });

  it("uses calm denied and retry states", () => {
    assert.equal(
      createBackgroundNavigationPresentation({
        navigationActive: true,
        status: "denied",
      })?.actionLabel,
      "Review access",
    );
    assert.equal(
      createBackgroundNavigationPresentation({
        navigationActive: true,
        status: "error",
      })?.actionLabel,
      "Retry",
    );
  });
});
