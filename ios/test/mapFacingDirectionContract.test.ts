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
      /<CompassTrackedMarker/,
    );
    assert.match(guestMap, /showsUserLocation=\{false\}/);
    assert.match(
      guestMap,
      /currentLocationVisible && liveCoordinate[\s\S]*<CompassTrackedMarker[\s\S]*guestMapCurrentLocationMarker/,
    );
    assert.match(
      guestMap,
      /<CompassTrackedMarker[\s\S]*enabled=\{permissionStatus === 'granted'\}[\s\S]*mapHeading=\{mapCameraHeadingDegrees\}/,
    );
  });

  it('keeps compass-facing direction separate from navigation camera bearing', () => {
    const liveMap = source('features/live-map/LiveMapScreen.tsx');
    const liveCanvas = source('features/live-map/LiveMapCanvas.tsx');

    assert.match(
      liveCanvas,
      /<CompassTrackedMarker[\s\S]*enabled=\{!demoDriveActive && permissionStatus === "granted"\}/,
    );
    assert.match(
      liveCanvas,
      /fallbackHeading=\{heading\}/,
    );
    assert.match(
      liveMap,
      /<LiveMapCanvas[\s\S]*heading=\{heading\}/,
    );
  });

  it('keeps one Apple-style puck mounted and rotates only its inner beam', () => {
    const markers = source('features/live-map/LiveMapMarkers.tsx');

    assert.match(markers, /useDeviceHeading\(enabled, \{[\s\S]*minimumUpdateIntervalMs: 80/);
    assert.match(markers, /styles\.vehicleMarkerDirection/);
    assert.match(markers, /LinearGradient id="appleHeadingBeam"/);
    assert.match(markers, /Animated\.timing\(animatedRotation/);
    assert.match(markers, /useNativeDriver: true/);
    assert.doesNotMatch(markers, /CompassDirectionPolygon/);
    assert.doesNotMatch(markers, /<Marker[\s\S]*rotation=/);
    assert.match(
      markers,
      /backgroundColor: colors\.appleBlue/,
    );
  });
});
