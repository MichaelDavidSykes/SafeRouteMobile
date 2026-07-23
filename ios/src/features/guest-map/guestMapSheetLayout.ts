export const GUEST_ROUTE_SHEET_VIEWPORT_FRACTION = 0.5;
export const GUEST_ROUTE_SHEET_MIN_BOTTOM_PADDING = 10;

export function resolveGuestRouteSheetHeight(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 0;
  }

  return Math.round(viewportHeight * GUEST_ROUTE_SHEET_VIEWPORT_FRACTION);
}

export function resolveGuestRouteSheetBottomPadding(safeAreaBottom: number): number {
  if (!Number.isFinite(safeAreaBottom) || safeAreaBottom <= 0) {
    return GUEST_ROUTE_SHEET_MIN_BOTTOM_PADDING;
  }

  return Math.max(GUEST_ROUTE_SHEET_MIN_BOTTOM_PADDING, Math.round(safeAreaBottom));
}
