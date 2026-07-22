import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createGuestMapRiskSummary } from "../src/features/guest-map/guestMapRiskSummary";
import type { RiskZone } from "../src/features/live-map/liveMapTypes";

const zone = (id: string, overrides: Partial<RiskZone> = {}): RiskZone => ({
  id,
  title: "Risk",
  description: "Risk detail",
  severity: "medium",
  category: "Area risk",
  coordinate: { latitude: 51.5, longitude: -0.1 },
  radiusMeters: 250,
  markerColor: "#f00",
  strokeColor: "#f00",
  fillColor: "rgba(255,0,0,.1)",
  ...overrides,
});

describe("guest map risk summary", () => {
  it("counts area coverage separately from route alerts", () => {
    const summary = createGuestMapRiskSummary([
      zone("area"),
      zone("route-alert", { shape: "route-alert" }),
    ]);

    assert.deepEqual(summary, {
      accessibilityLabel: "1 risk area and 1 route alert",
      riskAreaCount: 1,
      riskAreaLabel: "1 risk area",
      routeAlertCount: 1,
      routeAlertLabel: "1 route alert",
    });
  });

  it("uses correct empty and plural labels", () => {
    const summary = createGuestMapRiskSummary([
      zone("area-1"),
      zone("area-2"),
    ]);

    assert.equal(summary.riskAreaLabel, "2 risk areas");
    assert.equal(summary.routeAlertLabel, "0 route alerts");
  });
});
