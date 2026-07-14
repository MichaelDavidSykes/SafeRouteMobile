import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSuspendedNavigationPresentation } from "../src/features/live-map/suspendedNavigationState";

describe("suspended navigation presentation", () => {
  it("keeps guidance explicitly off while membership is checking", () => {
    assert.deepEqual(
      createSuspendedNavigationPresentation({ offline: false, status: "checking" }),
      {
        message: "Guidance stays off until this workspace is verified.",
        retryLabel: "Checking…",
        title: "Checking workspace access",
      },
    );
  });

  it("explains reconnect and manual retry without promising unsafe resume", () => {
    assert.match(
      createSuspendedNavigationPresentation({ offline: true, status: "paused" }).message,
      /Reconnect to verify access/,
    );
    assert.match(
      createSuspendedNavigationPresentation({ offline: false, status: "paused" }).message,
      /could not be verified/,
    );
  });
});
