import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const markerSource = () =>
  readFileSync(
    join(process.cwd(), "src/features/live-map/LiveMapMarkers.tsx"),
    "utf8",
  );

describe("live map risk overlay interactions", () => {
  it("keeps polygon and circular risk areas tappable with stable IDs", () => {
    const source = markerSource();
    const routeSegmentBlock =
      /testID=\{uiTestIds\.liveMapRouteRiskSegment\(zone\.id\)\}([\s\S]*?)\/>/.exec(
        source,
      )?.[0] || "";
    const polygonBlock = /<Polygon\s+([\s\S]*?)\/>/.exec(source)?.[1] || "";
    const circleBlock = /<TappableCircle\s+([\s\S]*?)\/>/.exec(source)?.[1] || "";
    const routeSegmentIdUsages = source.match(
      /testID=\{uiTestIds\.liveMapRouteRiskSegment\(zone\.id\)\}/g,
    ) || [];

    assert.match(source, /buildRouteRiskAlertSegment\(routeCoordinates \|\| \[\], zone\)/);
    assert.equal(routeSegmentIdUsages.length, 2);
    assert.match(routeSegmentBlock, /tappable=\{tappable\}/);
    assert.match(routeSegmentBlock, /onPress=\{handlePress\}/);

    assert.match(polygonBlock, /testID=\{uiTestIds\.liveMapRiskZoneArea\(zone\.id\)\}/);
    assert.match(polygonBlock, /tappable=\{tappable\}/);
    assert.match(polygonBlock, /onPress=\{handlePress\}/);

    assert.match(source, /const TappableCircle = Circle as ComponentType<TappableCircleProps>/);
    assert.match(circleBlock, /testID=\{uiTestIds\.liveMapRiskZoneArea\(zone\.id\)\}/);
    assert.match(circleBlock, /tappable=\{tappable\}/);
    assert.match(circleBlock, /onPress=\{handlePress\}/);
  });

  it("keeps the alert triangle visible while highlighting the selected risk area", () => {
    const source = markerSource();
    const riskMarkerFunction =
      /function RiskMarker[\s\S]*?export function VehicleMarker/.exec(source)?.[0] || "";

    assert.match(source, /strokeColor=\{coverageStrokeColor\}/);
    assert.match(source, /fillColor=\{coverageFillColor\}/);
    assert.match(source, /strokeWidth=\{selected \? 1 : 0\}/);
    assert.match(riskMarkerFunction, /zIndex=\{10\}/);
    assert.match(riskMarkerFunction, /useMotionValue\(selected \? 1 : 0,[\s\S]*spring: true/);
    assert.match(riskMarkerFunction, /styles\.riskMarkerSelectionRing/);
    assert.match(
      riskMarkerFunction,
      /backgroundColor: riskColors\.selectionHalo[\s\S]*borderColor: riskColors\.selectionStroke[\s\S]*opacity: selectionProgress/,
    );
    assert.doesNotMatch(riskMarkerFunction, /riskMarkerSelectionRingVisible/);
    assert.match(riskMarkerFunction, /<AlertTriangle[\s\S]*strokeWidth=\{2\.6\}/);
    assert.doesNotMatch(riskMarkerFunction, /zIndex=\{selected \|\| active/);
    assert.doesNotMatch(riskMarkerFunction, /selected\s*\?\s*<AlertTriangle/);
    assert.doesNotMatch(source, /rgba\(10, 12, 17, 0\.72\)/);
  });

  it("keeps native risk overlays mounted while hiding them", () => {
    const source = markerSource();

    assert.match(source, /const tappable = visible && Boolean\(onPress\)/);
    assert.match(source, /const riskStrokeColor = visible \? riskColors\.stroke : 'transparent'/);
    assert.match(source, /const coverageFillColor = visible[\s\S]*: 'transparent'/);
    assert.match(source, /opacity=\{visible \? 1 : 0\}/);
    assert.match(source, /accessibilityElementsHidden=\{!visible\}/);
  });

  it("exposes the live vehicle marker position to VoiceOver", () => {
    const source = markerSource();
    const vehicleMarkerFunction =
      /export function VehicleMarker[\s\S]*?export function createVehicleMarkerAccessibilityLabel/.exec(
        source,
      )?.[0] || "";
    const vehicleMarkerBlock =
      /<View[\s\S]*?style=\{styles\.vehicleMarker\}[\s\S]*?>/.exec(source)?.[0] || "";

    assert.match(
      vehicleMarkerFunction,
      /const markerTitle = demoDriveEnabled \? 'Route preview position' : 'Current position'/,
    );
    assert.match(vehicleMarkerFunction, /title=\{markerTitle\}/);
    assert.match(vehicleMarkerBlock, /accessible/);
    assert.match(
      vehicleMarkerBlock,
      /accessibilityLabel=\{createVehicleMarkerAccessibilityLabel\(demoDriveEnabled\)\}/,
    );
    assert.match(vehicleMarkerBlock, /accessibilityRole="image"/);
    assert.match(
      source,
      /return demoDriveEnabled \? 'Route preview position' : 'Current position'/,
    );
  });
});
