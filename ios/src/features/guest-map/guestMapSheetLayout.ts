export const GUEST_ROUTE_SHEET_VIEWPORT_FRACTION = 0.5;

export function resolveGuestRouteSheetHeight(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 0;
  }

  return Math.round(viewportHeight * GUEST_ROUTE_SHEET_VIEWPORT_FRACTION);
}
