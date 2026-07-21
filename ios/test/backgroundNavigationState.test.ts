import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createBackgroundNavigationPresentation } from "../src/features/live-map/backgroundNavigationState";
import { isBackgroundNavigationRuntimeSupported } from "../src/features/live-map/backgroundNavigationRuntime";

describe("background navigation presentation", () => {
  it("does not offer screen-lock guidance inside Expo Go", () => {
    assert.equal(
      isBackgroundNavigationRuntimeSupported({
        executionEnvironment: "storeClient",
        platform: "ios",
      }),
      false,
    );
    assert.equal(
      isBackgroundNavigationRuntimeSupported({
        executionEnvironment: "standalone",
        platform: "ios",
      }),
      true,
    );
    assert.equal(
      isBackgroundNavigationRuntimeSupported({
        executionEnvironment: "bare",
        platform: "android",
      }),
      true,
    );
    assert.equal(
      isBackgroundNavigationRuntimeSupported({
        executionEnvironment: "standalone",
        platform: "web",
      }),
      false,
    );
  });
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
