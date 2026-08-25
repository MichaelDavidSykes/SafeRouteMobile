import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RiskZone } from "../src/features/live-map/liveMapTypes";
import {
  resolveMapPolylineAtCoordinate,
  resolveRiskMapTapToleranceMeters,
  resolveRiskMarkerAtMapCoordinate,
  resolveRiskZoneAtMapCoordinate,
} from "../src/features/live-map/mapRiskInteraction";

function riskZone(overrides: Partial<RiskZone> = {}): RiskZone {
  return {
    category: "risk",
    coordinate: { latitude: 51.5, longitude: -0.12 },
    description: "",
    fillColor: "#ff880022",
    id: "risk-1",
    markerColor: "#ff8800",
    radiusMeters: 120,
    severity: "medium",
    strokeColor: "#ff8800",
    title: "Risk area",
    ...overrides,
  };
}

describe("map risk interaction", () => {
  it("resolves taps inside circular and polygon risk coverage", () => {
    const circle = riskZone();
    const polygon = riskZone({
      coordinate: { latitude: 51.51, longitude: -0.11 },
      id: "polygon",
      polygonCoordinates: [
        { latitude: 51.509, longitude: -0.111 },
        { latitude: 51.509, longitude: -0.109 },
        { latitude: 51.511, longitude: -0.109 },
        { latitude: 51.511, longitude: -0.111 },
      ],
    });

    assert.equal(
      resolveRiskZoneAtMapCoordinate({
        coordinate: { latitude: 51.5, longitude: -0.12 },
        zones: [circle, polygon],
      })?.id,
      circle.id,
    );
    assert.equal(
      resolveRiskZoneAtMapCoordinate({
        coordinate: { latitude: 51.51, longitude: -0.11 },
        zones: [circle, polygon],
      })?.id,
      polygon.id,
    );
  });

  it("adds a bounded screen-scale tolerance without selecting distant risks", () => {
    const zone = riskZone({ radiusMeters: 25 });
    const toleranceMeters = resolveRiskMapTapToleranceMeters({
      region: { latitudeDelta: 0.02 },
      viewportHeight: 800,
    });

    assert.ok(toleranceMeters >= 10 && toleranceMeters <= 120);
    assert.equal(
      resolveRiskZoneAtMapCoordinate({
        coordinate: { latitude: 51.5004, longitude: -0.12 },
        toleranceMeters,
        zones: [zone],
      })?.id,
      zone.id,
    );
    assert.equal(
      resolveRiskZoneAtMapCoordinate({
        coordinate: { latitude: 51.51, longitude: -0.12 },
        toleranceMeters,
        zones: [zone],
      }),
      null,
    );
  });

  it("leaves route-alert segment interaction to its dedicated marker", () => {
    const routeAlert = riskZone({
      id: "route-alert",
      routeSegmentCoordinates: [
        { latitude: 51.499, longitude: -0.12 },
        { latitude: 51.501, longitude: -0.12 },
      ],
      shape: "route-alert",
    });

    assert.equal(
      resolveRiskZoneAtMapCoordinate({
        coordinate: routeAlert.coordinate,
        toleranceMeters: 120,
        zones: [routeAlert],
      }),
      null,
    );
    assert.equal(
      resolveRiskMarkerAtMapCoordinate({
        coordinate: { latitude: 51.50008, longitude: -0.12 },
        toleranceMeters: 20,
        zones: [routeAlert],
      })?.id,
      routeAlert.id,
    );
    assert.equal(
      resolveRiskMarkerAtMapCoordinate({
        coordinate: { latitude: 51.501, longitude: -0.12 },
        toleranceMeters: 20,
        zones: [routeAlert],
      }),
      null,
    );
  });

  it("selects a nearby alternative route without native polyline hit-testing", () => {
    const primary = {
      coordinates: [
        { latitude: 51.5, longitude: -0.12 },
        { latitude: 51.51, longitude: -0.12 },
      ],
      id: "primary",
    };
    const alternative = {
      coordinates: [
        { latitude: 51.5, longitude: -0.11 },
        { latitude: 51.51, longitude: -0.11 },
      ],
      id: "alternative",
    };

    assert.equal(
      resolveMapPolylineAtCoordinate({
        coordinate: { latitude: 51.505, longitude: -0.1101 },
        polylines: [primary, alternative],
        toleranceMeters: 30,
      })?.id,
      alternative.id,
    );
    assert.equal(
      resolveMapPolylineAtCoordinate({
        coordinate: { latitude: 51.505, longitude: -0.105 },
        polylines: [primary, alternative],
        toleranceMeters: 30,
      }),
      null,
    );
  });
});
