import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GUEST_ROUTE_SHEET_MIN_BOTTOM_PADDING,
  GUEST_ROUTE_SHEET_VIEWPORT_FRACTION,
  GUEST_SELECTED_LOCATION_SCREEN_Y_FRACTION,
  regionForGuestSelectedLocation,
  resolveGuestRouteSheetBottomPadding,
  resolveGuestRouteSheetHeight,
} from '../src/features/guest-map/guestMapSheetLayout';

describe('guest map route sheet layout', () => {
  it('keeps the expanded location search sheet at half the portrait viewport', () => {
    assert.equal(GUEST_ROUTE_SHEET_VIEWPORT_FRACTION, 0.5);
    assert.equal(resolveGuestRouteSheetHeight(874), 437);
    assert.equal(resolveGuestRouteSheetHeight(667), 334);
  });

  it('fails closed for invalid viewport measurements', () => {
    assert.equal(resolveGuestRouteSheetHeight(0), 0);
    assert.equal(resolveGuestRouteSheetHeight(Number.NaN), 0);
    assert.equal(resolveGuestRouteSheetHeight(Number.POSITIVE_INFINITY), 0);
  });

  it('uses the safe-area inset without adding redundant bottom whitespace', () => {
    assert.equal(GUEST_ROUTE_SHEET_MIN_BOTTOM_PADDING, 10);
    assert.equal(resolveGuestRouteSheetBottomPadding(34), 34);
    assert.equal(resolveGuestRouteSheetBottomPadding(20.4), 20);
    assert.equal(resolveGuestRouteSheetBottomPadding(0), 10);
    assert.equal(resolveGuestRouteSheetBottomPadding(Number.NaN), 10);
  });

  it('places a selected search result above the half-height planner sheet', () => {
    const coordinate = { latitude: 51.5074, longitude: -0.1278 };
    const region = regionForGuestSelectedLocation(coordinate);
    const markerScreenYFraction =
      0.5 - (coordinate.latitude - region.latitude) / region.latitudeDelta;

    assert.equal(GUEST_SELECTED_LOCATION_SCREEN_Y_FRACTION, 0.38);
    assert.ok(region.latitude < coordinate.latitude);
    assert.ok(Math.abs(
      markerScreenYFraction - GUEST_SELECTED_LOCATION_SCREEN_Y_FRACTION
    ) < 0.000001);
    assert.equal(region.longitude, coordinate.longitude);
  });
});
