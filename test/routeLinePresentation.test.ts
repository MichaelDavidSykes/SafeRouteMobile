import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveRouteLinePresentation } from "../src/features/live-map/routeLinePresentation";
import { colors } from "../src/theme";

describe("live map route line presentation", () => {
  it("keeps the whole route visibly blue before guidance progress exists", () => {
    assert.deepEqual(
      resolveRouteLinePresentation({
        progressCoordinateCount: 0,
        routeCoordinateCount: 926,
      }),
      {
        completedStrokeColor: colors.routePrimary,
        completedStrokeWidth: 7,
        remainingStrokeColor: colors.routePrimary,
        remainingStrokeWidth: 8,
        showCompletedSegment: false,
      },
    );
  });

  it("mutes only the remaining route once completed progress is visible", () => {
    assert.deepEqual(
      resolveRouteLinePresentation({
        progressCoordinateCount: 12,
        routeCoordinateCount: 926,
      }),
      {
        completedStrokeColor: colors.routePrimary,
        completedStrokeWidth: 7,
        remainingStrokeColor: colors.routeRemaining,
        remainingStrokeWidth: 7,
        showCompletedSegment: true,
      },
    );
  });

  it("does not draw a completed overlay until at least two progress points exist", () => {
    assert.equal(
      resolveRouteLinePresentation({
        progressCoordinateCount: 1,
        routeCoordinateCount: 926,
      }).showCompletedSegment,
      false,
    );
  });

  it("treats invalid one-point routes as non-progress lines", () => {
    assert.equal(
      resolveRouteLinePresentation({
        progressCoordinateCount: 12,
        routeCoordinateCount: 1,
      }).showCompletedSegment,
      false,
    );
  });
});
