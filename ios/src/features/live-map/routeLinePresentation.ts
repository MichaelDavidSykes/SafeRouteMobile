import { colors } from "../../theme";
import { SAFE_ROUTE_ROUTE_CORE_WIDTH } from "../maps/safeRouteMapTheme";

export type RouteLinePresentation = {
  completedStrokeColor: string;
  completedStrokeWidth: number;
  remainingStrokeColor: string;
  remainingStrokeWidth: number;
  showCompletedSegment: boolean;
};

export function resolveRouteLinePresentation({
  progressCoordinateCount,
  routeCoordinateCount,
}: {
  progressCoordinateCount: number;
  routeCoordinateCount: number;
}): RouteLinePresentation {
  const hasDrawableRoute = routeCoordinateCount > 1;
  const hasCompletedSegment = hasDrawableRoute && progressCoordinateCount > 1;

  return {
    completedStrokeColor: colors.routePrimary,
    completedStrokeWidth: SAFE_ROUTE_ROUTE_CORE_WIDTH,
    remainingStrokeColor: hasCompletedSegment
      ? colors.routeRemaining
      : colors.routePrimary,
    remainingStrokeWidth: SAFE_ROUTE_ROUTE_CORE_WIDTH,
    showCompletedSegment: hasCompletedSegment,
  };
}
