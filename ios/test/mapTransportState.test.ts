import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveSafeRouteMapInterfaceStyle,
  resolveSafeRouteMapType,
} from "../src/features/api/mapTransportState";

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
      "hybrid",
    );
    assert.equal(
      resolveSafeRouteMapType({
        layer: "satellite",
        online: true,
        platform: "android",
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

  it("uses a light native presentation only for available satellite imagery", () => {
    assert.equal(
      resolveSafeRouteMapInterfaceStyle({
        layer: "satellite",
        online: true,
      }),
      "light",
    );
    assert.equal(
      resolveSafeRouteMapInterfaceStyle({
        layer: "satellite",
        online: false,
      }),
      "dark",
    );
    assert.equal(
      resolveSafeRouteMapInterfaceStyle({
        layer: "dark",
        online: true,
      }),
      "dark",
    );
  });
});
