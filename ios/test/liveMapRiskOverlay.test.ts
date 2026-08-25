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
      /const handleSelectRiskZone = useCallback\([\s\S]*?lastRiskZonePressAtMsRef\.current = Date\.now\(\);[\s\S]*?snapToIndex\(routeSheetDetailCompactIndex\)/,
    );
    assert.match(
      liveMapSource,
      /const handleRiskZonePress = useCallback\([\s\S]*?overlayRef\.current\?\.openRiskDetail\(\{ proximity, zone \}\);[\s\S]*?setAlertsVisible\(true\)/,
    );
  });

  it("keeps native risk geometry passive and handles taps once at map level", () => {
    const source = markerSource();
    const guestMapSource = readFileSync(
      join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
      "utf8",
    );
    const canvasSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapCanvas.tsx"),
      "utf8",
    );

    assert.match(source, /buildRouteRiskAlertSegment\(routeCoordinates \|\| \[\], zone\)/);
    assert.match(source, /<Polygon[\s\S]*testID=\{uiTestIds\.liveMapRiskZoneArea\(zone\.id\)\}/);
    assert.match(source, /<Circle[\s\S]*testID=\{uiTestIds\.liveMapRiskZoneArea\(zone\.id\)\}/);
    assert.doesNotMatch(source, /TappableCircle|onPress=\{handlePress\}/);
    assert.match(source, /tappable=\{visible && interactive\}/);
    assert.match(guestMapSource, /<RiskOverlay[\s\S]*onPress=\{handleSelectRiskZone\}/);
    assert.match(guestMapSource, /resolveRiskZoneAtMapCoordinate/);
    assert.match(canvasSource, /<RiskOverlay[\s\S]*onPress=\{onRiskZonePress\}/);
    assert.match(canvasSource, /resolveRiskZoneAtMapCoordinate/);
  });

  it("renders lightweight route-alert segments and markers above every route line", () => {
    const source = markerSource();

    assert.match(source, /const ROUTE_ALERT_CONNECTOR_Z_INDEX = 39/);
    assert.match(source, /const ROUTE_ALERT_CASING_Z_INDEX = 40/);
    assert.match(source, /const ROUTE_ALERT_CORE_Z_INDEX = 41/);
    assert.match(source, /const ROUTE_ALERT_MARKER_Z_INDEX = 42/);
    assert.match(
      source,
      /const showSegmentCasing = !routeAlert \|\| emphasized/,
    );
    assert.match(
      source,
      /const segmentCasingWidth = routeAlert[\s\S]*?\? 7/,
    );
    assert.match(
      source,
      /const segmentCoreWidth = routeAlert[\s\S]*?\? \(emphasized \? 4 : 3\)/,
    );
    assert.match(
      source,
      /connectorCoordinates\.length > 1[\s\S]*&& \(!routeAlert \|\| emphasized\)/,
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
    assert.match(riskMarkerFunction, /tracksViewChanges=\{false\}/);
    assert.doesNotMatch(riskMarkerFunction, /\bkey=/);
    assert.match(
      riskMarkerFunction,
      /accessibilityState=\{\{ selected: Boolean\(selected\) \}\}/,
    );
    assert.doesNotMatch(riskMarkerFunction, /useMotionValue/);
    assert.doesNotMatch(riskMarkerFunction, /riskMarkerSelectionRing/);
    assert.doesNotMatch(riskMarkerFunction, /riskMarkerSelected/);
    assert.match(riskMarkerFunction, /routeAlert \? \([\s\S]*<CircleAlert/);
    assert.match(riskMarkerFunction, /<CircleAlert[\s\S]*color=\{colors\.onAccent\}/);
    assert.match(riskMarkerFunction, /<AlertTriangle[\s\S]*strokeWidth=\{2\.6\}/);
    assert.match(riskMarkerFunction, /styles\.routeAlertMarker/);
    assert.doesNotMatch(riskMarkerFunction, /zIndex=\{selected \|\| active/);
    assert.doesNotMatch(riskMarkerFunction, /selected\s*\?\s*<AlertTriangle/);
    assert.doesNotMatch(source, /rgba\(10, 12, 17, 0\.72\)/);
  });

  it("keeps route-alert visuals compact without shrinking their accessible hit target", () => {
    const source = markerSource();
    const routeAlertMarkerStyle =
      /routeAlertMarker:\s*\{([\s\S]*?)\n  \},\n  riskMarkerHigh/.exec(source)?.[1] || "";
    const routeAlertHitAreaStyle =
      /routeAlertMarkerHitArea:\s*\{([\s\S]*?)\n  \},\n  vehicleMarker/.exec(source)?.[1] || "";

    assert.match(routeAlertMarkerStyle, /width:\s*22/);
    assert.match(routeAlertMarkerStyle, /height:\s*22/);
    assert.match(routeAlertMarkerStyle, /shadowOpacity:\s*0/);
    assert.match(routeAlertMarkerStyle, /elevation:\s*0/);
    assert.match(routeAlertHitAreaStyle, /width:\s*44/);
    assert.match(routeAlertHitAreaStyle, /height:\s*44/);
  });

  it("keeps the bounded native map topology stable while risk visibility changes", () => {
    const source = markerSource();
    const canvasSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapCanvas.tsx"),
      "utf8",
    );
    const liveMapSource = readFileSync(
      join(process.cwd(), "src/features/live-map/LiveMapScreen.tsx"),
      "utf8",
    );

    assert.doesNotMatch(source, /if \(!visible\) \{\s*return null;\s*\}/);
    assert.match(
      source,
      /routeSegmentCoordinates\.length <= 1[\s\S]*buildRouteRiskAlertSegment/,
    );
    assert.doesNotMatch(
      source,
      /showRouteProximitySegment && routeSegmentCoordinates\.length <= 1/,
    );
    assert.match(canvasSource, /\{mountedRiskZones\.map\(\(zone\) => \(/);
    assert.match(canvasSource, /visible=\{visibleRiskZoneIds\.has\(zone\.id\)\}/);
    assert.match(canvasSource, /key=\{mapTopologyKey\}/);
    assert.match(canvasSource, /routePlan\.checkpoints\.map\(\(checkpoint\) => \(/);
    assert.match(canvasSource, /visible=\{\s*showRouteCheckpoints && shouldRenderRouteCheckpointMarker/);
    const checkpointMarker =
      /export function CheckpointMarker[\s\S]*?export const SupportFacilityMarker/.exec(source)?.[0] || "";
    assert.match(checkpointMarker, /tracksViewChanges=\{false\}/);
    assert.match(
      liveMapSource,
      /const liveMapInventoryLocked =[\s\S]*activeNavigationState === "navigating"[\s\S]*activeNavigationState === "off-route"/,
    );
    assert.doesNotMatch(canvasSource, /routePlan\.riskZones\.map/);
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
      /collapsable=\{false\}[\s\S]*?style=\{styles\.vehicleMarker\}/,
    );
    assert.match(vehicleMarkerFunction, /tracksViewChanges=\{false\}/);
    assert.doesNotMatch(source, /styles\.vehicleHeadingOverlay/);
    assert.match(
      source,
      /return demoDriveEnabled \? 'Route preview position' : 'Current position'/,
    );
  });
});
