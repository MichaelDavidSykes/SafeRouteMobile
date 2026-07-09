import { colors } from "../../theme";

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
  const hasRoute = routeCoordinateCount > 1;
  const hasCompletedSegment = hasRoute && progressCoordinateCount > 1;

  return {
    completedStrokeColor: colors.routePrimary,
    completedStrokeWidth: 7,
    remainingStrokeColor: hasCompletedSegment
      ? colors.routeRemaining
      : colors.routePrimary,
    remainingStrokeWidth: hasCompletedSegment ? 7 : 8,
    showCompletedSegment: hasCompletedSegment,
  };
}
