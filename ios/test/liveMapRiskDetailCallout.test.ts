import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveRiskCalloutPlacement } from "../src/features/live-map/liveMapRiskDetailPlacement";

describe("map-anchored risk detail callout", () => {
  it("keeps the detail above a central marker and links back to it", () => {
    const placement = resolveRiskCalloutPlacement({
      anchorPoint: { x: 195, y: 360 },
      calloutHeight: 164,
      viewportHeight: 844,
      viewportWidth: 390,
    });

    assert.ok(placement.top < 360);
    assert.ok(placement.left >= 14);
    assert.ok(placement.connectorLength > 20);
    assert.equal(placement.width, 286);
  });

  it("moves below top-edge markers and remains inside compact phones", () => {
    const placement = resolveRiskCalloutPlacement({
      anchorPoint: { x: 20, y: 42 },
      calloutHeight: 190,
      viewportHeight: 667,
      viewportWidth: 320,
    });

    assert.ok(placement.top > 42);
    assert.equal(placement.left, 14);
    assert.ok(placement.left + placement.width <= 306);
    assert.ok(placement.connectorLength > 1);
  });
});
