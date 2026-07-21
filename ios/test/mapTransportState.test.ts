import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveSafeRouteMapType } from "../src/features/api/mapTransportState";

describe("map transport state", () => {
  it("disables native map downloads until the shared network state is online", () => {
    assert.equal(
      resolveSafeRouteMapType({ online: false, platform: "ios" }),
      "none",
    );
    assert.equal(
      resolveSafeRouteMapType({ online: false, platform: "android" }),
      "none",
    );
    assert.equal(
      resolveSafeRouteMapType({ online: true, platform: "ios" }),
      "mutedStandard",
    );
    assert.equal(
      resolveSafeRouteMapType({ online: true, platform: "android" }),
      "standard",
    );
    assert.equal(
      resolveSafeRouteMapType({
        layer: "satellite",
        online: true,
        platform: "ios",
      }),
      "satellite",
    );
    assert.equal(
      resolveSafeRouteMapType({
        layer: "satellite",
        online: false,
        platform: "ios",
      }),
      "none",
    );
  });
});
