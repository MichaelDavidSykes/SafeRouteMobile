import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  shouldDismissRiskDetailGesture,
  shouldStartRiskDetailDismissGesture,
} from "../src/features/live-map/riskDetailInteraction";

describe("risk detail interaction", () => {
  it("starts only for a deliberate downward card drag", () => {
    assert.equal(
      shouldStartRiskDetailDismissGesture({
        translationX: 2,
        translationY: 18,
      }),
      true,
    );
    assert.equal(
      shouldStartRiskDetailDismissGesture({
        translationX: 24,
        translationY: 12,
      }),
      false,
    );
    assert.equal(
      shouldStartRiskDetailDismissGesture({
        translationX: 0,
        translationY: -20,
      }),
      false,
    );
  });

  it("dismisses for a downward distance or flick and restores short drags", () => {
    assert.equal(
      shouldDismissRiskDetailGesture({
        translationX: 0,
        translationY: 72,
      }),
      true,
    );
    assert.equal(
      shouldDismissRiskDetailGesture({
        translationX: 0,
        translationY: 24,
        velocityY: 0.9,
      }),
      true,
    );
    assert.equal(
      shouldDismissRiskDetailGesture({
        translationX: 0,
        translationY: 30,
        velocityY: 0.2,
      }),
      false,
    );
  });

  it("keeps risk details open during map pans in both map modes", () => {
    const guestMap = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );
    const liveMap = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapScreen.tsx"),
      "utf8",
    );
    const canvas = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapCanvas.tsx"),
      "utf8",
    );
    const callout = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapRiskDetailCallout.tsx"),
      "utf8",
    );
    const guestPanHandler =
      /onPanDrag=\{\(\) => \{([\s\S]*?)\}\}/.exec(guestMap)?.[1] || "";
    const livePanHandler =
      /const handleMapPanDrag = \(\) => \{([\s\S]*?)\n  \};/.exec(liveMap)?.[1] || "";

    assert.doesNotMatch(guestPanHandler, /setSelectedRiskZone\(null\)/);
    assert.doesNotMatch(livePanHandler, /setSelectedRiskZoneId\(null\)/);
    assert.match(guestMap, /onPress=\{handleMapPress\}/);
    assert.match(canvas, /onPress=\{onMapPress\}/);
    assert.match(callout, /PanResponder\.create/);
    assert.match(callout, /shouldDismissRiskDetailGesture/);
  });
});
