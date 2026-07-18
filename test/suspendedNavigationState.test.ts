import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSuspendedNavigationPresentation } from "../src/features/live-map/suspendedNavigationState";

describe("suspended navigation presentation", () => {
  it("keeps guidance explicitly off while membership is checking", () => {
    assert.deepEqual(
      createSuspendedNavigationPresentation({
        networkStatus: "online",
        status: "checking",
      }),
      {
        message: "Confirming this saved route is ready to resume.",
        retryAccessibilityLabel: "Restoring saved route",
        retryBusy: true,
        retryLabel: "Restoring…",
        title: "Restoring route",
      },
    );
  });

  it("explains reconnect and manual retry without promising unsafe resume", () => {
    assert.match(
      createSuspendedNavigationPresentation({
        networkStatus: "offline",
        status: "paused",
      }).message,
      /Reconnect to verify access/,
    );
    assert.match(
      createSuspendedNavigationPresentation({
        networkStatus: "online",
        status: "paused",
      }).message,
      /could not be verified/,
    );
  });

  it("names connection checking without calling it offline", () => {
    const presentation = createSuspendedNavigationPresentation({
      networkStatus: "checking",
      status: "paused",
    });

    assert.match(presentation.message, /Checking connection/);
    assert.equal(presentation.retryBusy, true);
    assert.equal(presentation.retryLabel, "Waiting…");
    assert.match(presentation.retryAccessibilityLabel, /Checking connection/);
    assert.doesNotMatch(presentation.message, /offline/i);
  });

  it("keeps offline interruption distinct while a retry was checking", () => {
    const presentation = createSuspendedNavigationPresentation({
      networkStatus: "offline",
      status: "checking",
    });

    assert.match(presentation.message, /Reconnect/);
    assert.equal(presentation.retryBusy, false);
    assert.equal(presentation.retryLabel, "Reconnect");
  });
});
