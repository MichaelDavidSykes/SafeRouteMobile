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
  it("memoizes native route-alert overlays across location and heading updates", () => {
    const source = markerSource();
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );
    const liveMapSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapScreen.tsx"),
      "utf8",
    );

    assert.match(source, /import \{ memo \} from 'react'/);
    assert.match(source, /export const RiskOverlay = memo\(function RiskOverlay/);
    assert.match(
      guestMapSource,
      /const handleSelectRiskZone = useCallback\([\s\S]*?sheetGestureActionRef\.current\(true\);[\s\S]*?\}, \[\]\);/,
    );
    assert.match(
      liveMapSource,
      /const handleRiskZonePress = useCallback\([\s\S]*?setAlertsVisible\(true\);[\s\S]*?\}, \[\]\);/,
    );
  });

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

  it("renders route-alert casing, core, connectors, and markers above every route line", () => {
    const source = markerSource();

    assert.match(source, /const ROUTE_ALERT_CONNECTOR_Z_INDEX = 39/);
    assert.match(source, /const ROUTE_ALERT_CASING_Z_INDEX = 40/);
    assert.match(source, /const ROUTE_ALERT_CORE_Z_INDEX = 41/);
    assert.match(source, /const ROUTE_ALERT_MARKER_Z_INDEX = 42/);
    assert.match(
      source,
      /const segmentCasingWidth = routeAlert[\s\S]*\? \(emphasized \? 11 : 10\)/,
    );
    assert.match(
      source,
      /const segmentCoreWidth = routeAlert[\s\S]*\? \(emphasized \? 5 : 4\)/,
    );
    assert.equal(
      (source.match(/zIndex=\{segmentCasingZIndex\}/g) || []).length,
      2,
    );
    assert.equal(
      (source.match(/zIndex=\{segmentCoreZIndex\}/g) || []).length,
      2,
    );
  });

  it("distinguishes route-alert markers while highlighting selected risk areas", () => {
    const source = markerSource();
    const riskMarkerFunction =
      /function RiskMarker[\s\S]*?export function VehicleMarker/.exec(source)?.[0] || "";

    assert.match(source, /strokeColor=\{coverageStrokeColor\}/);
    assert.match(source, /fillColor=\{coverageFillColor\}/);
    assert.match(source, /strokeWidth=\{selected \? 1 : 0\}/);
    assert.match(
      riskMarkerFunction,
      /zIndex=\{routeAlert \? ROUTE_ALERT_MARKER_Z_INDEX : 10\}/,
    );
    assert.match(riskMarkerFunction, /useMotionValue\(selected \? 1 : 0,[\s\S]*spring: true/);
    assert.match(riskMarkerFunction, /styles\.riskMarkerSelectionRing/);
    assert.match(
      riskMarkerFunction,
      /backgroundColor: riskColors\.selectionHalo[\s\S]*borderColor: riskColors\.selectionStroke[\s\S]*opacity: selectionProgress/,
    );
    assert.doesNotMatch(riskMarkerFunction, /riskMarkerSelectionRingVisible/);
    assert.match(riskMarkerFunction, /routeAlert \? \([\s\S]*<CircleAlert/);
    assert.match(riskMarkerFunction, /<CircleAlert[\s\S]*color=\{colors\.surface\}/);
    assert.match(riskMarkerFunction, /<AlertTriangle[\s\S]*strokeWidth=\{2\.6\}/);
    assert.match(riskMarkerFunction, /styles\.routeAlertMarker/);
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
    assert.match(
      vehicleMarkerFunction,
      /const markerTitle = demoDriveEnabled \? 'Route preview position' : 'Current position'/,
    );
    assert.match(vehicleMarkerFunction, /title=\{markerTitle\}/);
    assert.match(vehicleMarkerFunction, /<View[\s\S]*?accessible/);
    assert.match(
      vehicleMarkerFunction,
      /accessibilityLabel=\{createVehicleMarkerAccessibilityLabel\(demoDriveEnabled\)\}/,
    );
    assert.match(vehicleMarkerFunction, /accessibilityRole="image"/);
    assert.match(
      vehicleMarkerFunction,
      /style=\{\[[\s\S]*?styles\.vehicleMarker[\s\S]*?screenRotation/,
    );
    assert.match(
      source,
      /return demoDriveEnabled \? 'Route preview position' : 'Current position'/,
    );
  });
});
