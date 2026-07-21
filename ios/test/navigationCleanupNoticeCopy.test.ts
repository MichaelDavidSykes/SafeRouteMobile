import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { createNavigationCleanupNoticeCopy } from "../src/features/live-map/navigationCleanupNoticeCopy";

describe("navigation cleanup notice copy", () => {
  it("describes a retained workspace handoff during cleanup and retry", () => {
    assert.deepEqual(
      createNavigationCleanupNoticeCopy({
        checking: true,
        workspaceName: "West Corridor",
      }),
      {
        accessibilityMessage:
          "Removing saved guidance before changing to West Corridor.",
        actionAccessibilityLabel:
          "Removing guidance before changing to West Corridor",
        message:
          "Removing saved guidance before changing to West Corridor.",
      },
    );
    assert.deepEqual(
      createNavigationCleanupNoticeCopy({
        checking: false,
        workspaceName: "West Corridor",
      }),
      {
        accessibilityMessage:
          "SafeRoute could not remove saved guidance. Retry to finish changing to West Corridor.",
        actionAccessibilityLabel:
          "Retry cleanup and change to West Corridor",
        message:
          "SafeRoute could not remove saved guidance. Retry to finish changing to West Corridor.",
      },
    );
  });

  it("preserves generic cleanup semantics without a retained handoff", () => {
    assert.deepEqual(
      createNavigationCleanupNoticeCopy({
        checking: false,
        workspaceName: " ",
      }),
      {
        accessibilityMessage:
          "SafeRoute could not remove saved guidance. Retry before starting another route.",
        actionAccessibilityLabel: "Retry guidance cleanup",
        message:
          "SafeRoute could not remove saved guidance. Retry before starting another route.",
      },
    );
  });

  it("bounds visible target copy while preserving the full accessible name", () => {
    const workspaceName =
      "West Corridor Logistics and Emergency Coordination Workspace";
    const copy = createNavigationCleanupNoticeCopy({
      checking: false,
      workspaceName,
    });

    assert.match(copy.message, /…\.$/);
    assert.ok(copy.message.length < copy.accessibilityMessage.length);
    assert.match(copy.accessibilityMessage, new RegExp(`${workspaceName}\\.$`));
    assert.equal(
      copy.actionAccessibilityLabel,
      `Retry cleanup and change to ${workspaceName}`,
    );
  });

  it("keeps the compact notice action visible while exposing full copy to assistive technology", () => {
    const source = readFileSync(
      new URL(
        "../src/features/live-map/NavigationCleanupNotice.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(source, /accessibilityLabel=\{`Guidance cleanup needed\. \$\{accessibilityMessage\}`\}/);
    assert.match(source, /ellipsizeMode="tail" numberOfLines=\{3\}/);
    assert.match(source, /minHeight: 44/);
  });
});
