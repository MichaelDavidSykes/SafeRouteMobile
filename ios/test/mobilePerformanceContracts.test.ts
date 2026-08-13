import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { LatLng } from "react-native-maps";
import type { RiskZone } from "../src/features/live-map/liveMapTypes";
import { calculateRouteProgress } from "../src/features/live-map/routeProgress";
import { prepareRouteGeometry } from "../src/features/live-map/routeGeometry";
import {
  createRouteRiskSpatialIndex,
  cullVisibleRiskZones,
} from "../src/features/live-map/routeRisk";
import { mapRouteDtoToSavedSummaryPlan } from "../src/features/routes/routeMapper";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile performance contracts", () => {
  it("reuses immutable route metrics across live samples", () => {
    const coordinates: LatLng[] = Array.from({ length: 1_400 }, (_, index) => ({
      latitude: -33.95 + index * 0.00004,
      longitude: 18.45 + index * 0.00005,
    }));
    const first = prepareRouteGeometry(coordinates);
    const second = prepareRouteGeometry(coordinates);

    assert.equal(second, first);
    assert.equal(first.segmentLengths.length, 1_399);
    assert.ok(first.totalDistanceMeters > 0);
    assert.ok(calculateRouteProgress(coordinates, coordinates[700]));
    assert.equal(prepareRouteGeometry(coordinates), first);
  });

  it("bounds mounted live risk overlays while retaining selected and active risks", () => {
    const coordinates: LatLng[] = [
      { latitude: -33.95, longitude: 18.45 },
      { latitude: -33.75, longitude: 18.65 },
    ];
    const zones: RiskZone[] = Array.from({ length: 160 }, (_, index) => ({
      category: "risk",
      coordinate: {
        latitude: -33.95 + index * 0.001,
        longitude: 18.45 + index * 0.001,
      },
      description: "",
      fillColor: "#f002",
      id: `risk-${index}`,
      markerColor: "#f00",
      radiusMeters: 100,
      severity: index % 5 === 0 ? "high" : "medium",
      strokeColor: "#f00",
      title: `Risk ${index}`,
    }));
    const progress = calculateRouteProgress(coordinates, coordinates[0]);
    const visible = cullVisibleRiskZones({
      activeRiskZoneId: "risk-159",
      maxCount: 80,
      progress,
      riskIndex: createRouteRiskSpatialIndex(coordinates, zones),
      riskZones: zones,
      selectedRiskZoneId: "risk-158",
    });

    assert.equal(visible.length, 80);
    assert.ok(visible.some((zone) => zone.id === "risk-159"));
    assert.ok(visible.some((zone) => zone.id === "risk-158"));
  });

  it("drops detail geometry and risk payloads from the route-list model", () => {
    const coordinates = Array.from({ length: 1_000 }, (_, index) => ({
      latitude: 51.5 + index * 0.00001,
      longitude: -0.1 + index * 0.00001,
    }));
    const summary = mapRouteDtoToSavedSummaryPlan({
      id: "route-1",
      origin: { coordinate: coordinates[0], label: "Origin" },
      destination: { coordinate: coordinates[999], label: "Destination" },
      route: { coordinates },
      risk_overlays: Array.from({ length: 100 }, (_, index) => ({
        coordinate: coordinates[index],
        id: `risk-${index}`,
      })),
    });

    assert.equal(summary.isSummary, true);
    assert.equal(summary.route.coordinates.length, 2);
    assert.equal(summary.riskZones.length, 0);
    assert.equal(summary.route.navigationSteps?.length, 0);
  });

  it("virtualizes list rows and mounts only the visible native risk set", () => {
    const canvas = source("src/features/live-map/LiveMapCanvas.tsx");
    const routeList = source("src/features/routes/RouteListScreen.tsx");
    const operations = source("src/features/operations/OperationsScreen.tsx");

    assert.match(canvas, /visibleRiskZones\.map/);
    assert.doesNotMatch(canvas, /routePlan\.riskZones\.map/);
    assert.match(routeList, /<FlatList[\s\S]*initialNumToRender=\{8\}[\s\S]*windowSize=\{7\}/);
    assert.match(routeList, /onEndReached=\{\(\) => void loadNextRoutePage\(\)\}/);
    assert.match(routeList, /fetchSavedRoutes\(accessToken, requestWorkspaceId, \{ offset \}\)/);
    assert.doesNotMatch(routeList, /filteredRoutes\.map/);
    assert.match(operations, /<FlatList[\s\S]*initialNumToRender=\{8\}[\s\S]*windowSize=\{7\}/);
    assert.doesNotMatch(operations, /plannedRows\.map\(\(row\) => \(\s*<OperationsRouteCard/);
  });
});
