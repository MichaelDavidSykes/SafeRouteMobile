import type { LatLng, Region } from 'react-native-maps';

export const GUEST_ROUTE_SHEET_VIEWPORT_FRACTION = 0.5;
export const GUEST_MAP_SHEET_COLLAPSED_HEIGHT = 76;
export const GUEST_MAP_SHEET_DETAIL_COMPACT_HEIGHT = 224;
export const GUEST_MAP_SHEET_DETAIL_EXPANDED_HEIGHT = 500;
export const GUEST_ROUTE_SHEET_MIN_BOTTOM_PADDING = 10;
export const GUEST_ROUTE_FIT_MIN_BOTTOM_PADDING = 360;
export const GUEST_ROUTE_FIT_ENDPOINT_CLEARANCE = 48;
export const GUEST_SELECTED_LOCATION_SCREEN_Y_FRACTION = 0.38;
export const GUEST_SELECTED_LOCATION_LATITUDE_DELTA = 0.045;
export const GUEST_SELECTED_LOCATION_LONGITUDE_DELTA = 0.055;

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

export function resolveGuestRouteFitBottomPadding(viewportHeight: number): number {
  const sheetHeight = resolveGuestRouteSheetHeight(viewportHeight);
  if (!sheetHeight) {
    return GUEST_ROUTE_FIT_MIN_BOTTOM_PADDING;
  }

  return Math.max(
    GUEST_ROUTE_FIT_MIN_BOTTOM_PADDING,
    sheetHeight + GUEST_ROUTE_FIT_ENDPOINT_CLEARANCE,
  );
}

export interface GuestMapSheetLayout {
  collapsedIndex: number;
  detailCompactIndex: number;
  detailExpandedIndex: number;
  plannerIndex: number;
  snapPoints: number[];
}

export function createGuestMapSheetLayout(
  viewportHeight: number,
  bottomInset: number,
): GuestMapSheetLayout {
  const normalizedViewportHeight =
    Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : GUEST_MAP_SHEET_COLLAPSED_HEIGHT + Math.max(0, bottomInset) + 12;
  const availableHeight = Math.max(
    GUEST_MAP_SHEET_COLLAPSED_HEIGHT,
    Math.round(normalizedViewportHeight - Math.max(0, bottomInset) - 12),
  );
  const collapsedHeight = Math.min(
    GUEST_MAP_SHEET_COLLAPSED_HEIGHT,
    availableHeight,
  );
  const compactHeight = Math.min(
    GUEST_MAP_SHEET_DETAIL_COMPACT_HEIGHT,
    availableHeight,
  );
  const plannerHeight = Math.min(
    Math.max(
      collapsedHeight,
      resolveGuestRouteSheetHeight(normalizedViewportHeight),
    ),
    availableHeight,
  );
  const expandedHeight = Math.min(
    GUEST_MAP_SHEET_DETAIL_EXPANDED_HEIGHT,
    availableHeight,
  );
  const snapPoints = Array.from(new Set([
    collapsedHeight,
    compactHeight,
    plannerHeight,
    expandedHeight,
  ])).sort((left, right) => left - right);

  return {
    collapsedIndex: snapPoints.indexOf(collapsedHeight),
    detailCompactIndex: snapPoints.indexOf(compactHeight),
    detailExpandedIndex: snapPoints.indexOf(expandedHeight),
    plannerIndex: snapPoints.indexOf(plannerHeight),
    snapPoints,
  };
}

export function regionForGuestSelectedLocation(
  coordinate: LatLng
): Region {
  const latitudeDelta = GUEST_SELECTED_LOCATION_LATITUDE_DELTA;
  const verticalOffsetRatio =
    0.5 - GUEST_SELECTED_LOCATION_SCREEN_Y_FRACTION;
  const halfLatitudeDelta = latitudeDelta / 2;
  const centeredLatitude = coordinate.latitude
    - latitudeDelta * verticalOffsetRatio;

  return {
    latitude: Math.max(
      -90 + halfLatitudeDelta,
      Math.min(90 - halfLatitudeDelta, centeredLatitude)
    ),
    longitude: coordinate.longitude,
    latitudeDelta,
    longitudeDelta: GUEST_SELECTED_LOCATION_LONGITUDE_DELTA
  };
}
