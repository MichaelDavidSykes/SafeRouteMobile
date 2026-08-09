import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
}

describe('map facing-direction indicator', () => {
  it('uses the device compass for the planning-map location puck', () => {
    const guestMap = source('features/guest-map/GuestMapScreen.tsx');

    assert.match(
      guestMap,
      /useDeviceHeading\(permissionStatus === 'granted'\)/,
    );
    assert.match(guestMap, /showsUserLocation=\{false\}/);
    assert.match(
      guestMap,
      /currentLocationVisible && liveCoordinate[\s\S]*<VehicleMarker[\s\S]*heading=\{deviceHeadingDegrees\}[\s\S]*guestMapCurrentLocationMarker/,
    );
  });

  it('keeps compass-facing direction separate from navigation camera bearing', () => {
    const liveMap = source('features/live-map/LiveMapScreen.tsx');

    assert.match(
      liveMap,
      /const deviceHeadingDegrees = useDeviceHeading\([\s\S]*!demoDriveActive[\s\S]*permissionStatus === "granted"/,
    );
    assert.match(
      liveMap,
      /const vehicleFacingHeading = demoDriveActive[\s\S]*deviceHeadingDegrees \?\?[\s\S]*coordinate\?\.heading/,
    );
    assert.match(liveMap, /<LiveMapCanvas[\s\S]*heading=\{vehicleFacingHeading\}/);
  });

  it('renders a map-relative arrow only when a facing heading is available', () => {
    const markers = source('features/live-map/LiveMapMarkers.tsx');

    assert.match(markers, /heading: number \| null/);
    assert.match(markers, /flat=\{heading !== null\}/);
    assert.match(markers, /rotation=\{heading \?\? 0\}/);
    assert.match(
      markers,
      /heading !== null \? \([\s\S]*styles\.vehicleMarkerHeading/,
    );
    assert.match(
      markers,
      /vehicleMarkerHeading:[\s\S]*borderBottomColor: 'rgba\(10, 132, 255, 0\.82\)'/,
    );
  });
});
