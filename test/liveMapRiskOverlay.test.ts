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
    assert.match(routeSegmentBlock, /tappable=\{Boolean\(onPress\)\}/);
    assert.match(routeSegmentBlock, /onPress=\{handlePress\}/);

    assert.match(polygonBlock, /testID=\{uiTestIds\.liveMapRiskZoneArea\(zone\.id\)\}/);
    assert.match(polygonBlock, /tappable=\{Boolean\(onPress\)\}/);
    assert.match(polygonBlock, /onPress=\{handlePress\}/);

    assert.match(source, /const TappableCircle = Circle as ComponentType<TappableCircleProps>/);
    assert.match(circleBlock, /testID=\{uiTestIds\.liveMapRiskZoneArea\(zone\.id\)\}/);
    assert.match(circleBlock, /tappable=\{Boolean\(onPress\)\}/);
    assert.match(circleBlock, /onPress=\{handlePress\}/);
  });
});
