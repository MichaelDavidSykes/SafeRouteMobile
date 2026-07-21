import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RiskZone } from "../src/features/live-map/liveMapTypes";
import {
  isRouteAlertZone,
  shouldRenderRiskCoverage,
  visibleRiskRadiusMeters,
} from "../src/features/live-map/riskOverlayPresentation";

const zone = (overrides: Partial<RiskZone> = {}): RiskZone => ({
  id: "risk-1",
  title: "Risk",
  description: "Risk detail",
  severity: "medium",
  category: "Route alert",
  coordinate: { latitude: 51.5, longitude: -0.1 },
  radiusMeters: 250,
  markerColor: "#f00",
  strokeColor: "#f00",
  fillColor: "rgba(255,0,0,.1)",
  ...overrides,
});

describe("planner-aligned mobile risk overlays", () => {
  it("renders route alerts as compact route segments rather than coverage circles", () => {
    const alert = zone({
      shape: "route-alert",
      routeSegmentCoordinates: [
        { latitude: 51.5, longitude: -0.1 },
        { latitude: 51.501, longitude: -0.099 },
      ],
    });

    assert.equal(isRouteAlertZone(alert), true);
    assert.equal(shouldRenderRiskCoverage(alert), false);
  });

  it("preserves real polygon and circle coverage while bounding oversized circles", () => {
    const circle = zone({ radiusMeters: 50_000 });
    const polygon = zone({
      polygonCoordinates: [
        { latitude: 51.5, longitude: -0.1 },
        { latitude: 51.51, longitude: -0.1 },
        { latitude: 51.51, longitude: -0.09 },
      ],
    });

    assert.equal(shouldRenderRiskCoverage(circle), true);
    assert.equal(shouldRenderRiskCoverage(polygon), true);
    assert.equal(visibleRiskRadiusMeters(circle), 10_000);
  });
});
