export interface MapScreenPoint {
  x: number;
  y: number;
}

const CALLOUT_MAX_WIDTH = 286;
const CALLOUT_EDGE_INSET = 14;
const CALLOUT_MARKER_GAP = 28;

export function resolveRiskCalloutPlacement({
  anchorPoint,
  calloutHeight,
  viewportHeight,
  viewportWidth,
}: {
  anchorPoint: MapScreenPoint;
  calloutHeight: number;
  viewportHeight: number;
  viewportWidth: number;
}) {
  const width = Math.max(220, Math.min(CALLOUT_MAX_WIDTH, viewportWidth - CALLOUT_EDGE_INSET * 2));
  const left = clamp(
    anchorPoint.x - width / 2,
    CALLOUT_EDGE_INSET,
    Math.max(CALLOUT_EDGE_INSET, viewportWidth - width - CALLOUT_EDGE_INSET),
  );
  const topCandidate = anchorPoint.y - calloutHeight - CALLOUT_MARKER_GAP;
  const placeBelow = topCandidate < 64;
  const top = clamp(
    placeBelow ? anchorPoint.y + CALLOUT_MARKER_GAP : topCandidate,
    64,
    Math.max(64, viewportHeight - calloutHeight - 24),
  );
  const connectorStart = {
    x: clamp(anchorPoint.x, left + 24, left + width - 24),
    y: placeBelow ? top : top + calloutHeight,
  };
  const deltaX = anchorPoint.x - connectorStart.x;
  const deltaY = anchorPoint.y - connectorStart.y;
  const connectorLength = Math.max(1, Math.hypot(deltaX, deltaY));

  return {
    connectorLeft: (connectorStart.x + anchorPoint.x) / 2 - 0.75,
    connectorLength,
    connectorRotationDegrees: Math.atan2(deltaY, deltaX) * (180 / Math.PI) - 90,
    connectorTop: (connectorStart.y + anchorPoint.y) / 2 - connectorLength / 2,
    left,
    top,
    width,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
