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
      /<CompassDirectionOverlay[\s\S]*enabled=\{permissionStatus === 'granted'\}[\s\S]*mapHeading=\{mapCameraHeadingDegrees\}[\s\S]*mapRef=\{mapRef\}/,
    );
    assert.match(guestMap, /mapRef\.current\?\.getCamera\(\)/);
    assert.match(guestMap, /setMapCameraHeadingDegrees\(Number\.isFinite\(nextHeading\) \? nextHeading : 0\)/);
  });

  it('keeps compass-facing direction separate from navigation camera bearing', () => {
    const liveMap = source('features/live-map/LiveMapScreen.tsx');
    const liveCanvas = source('features/live-map/LiveMapCanvas.tsx');

    assert.match(
      liveCanvas,
      /<CompassDirectionOverlay[\s\S]*enabled=\{!demoDriveActive && permissionStatus === "granted"\}/,
    );
    assert.match(
      liveCanvas,
      /fallbackHeading=\{heading\}/,
    );
    assert.match(
      liveMap,
      /<LiveMapCanvas[\s\S]*heading=\{heading\}[\s\S]*mapHeading=\{mapCameraHeadingDegrees\}/,
    );
    assert.match(liveMap, /mapRef\.current\?\.getCamera\(\)/);
  });

  it('rotates a React overlay outside Apple MapKit marker snapshots', () => {
    const markers = source('features/live-map/LiveMapMarkers.tsx');

    assert.match(markers, /mapHeading: number/);
    assert.match(
      markers,
      /resolveDeviceHeadingScreenRotation\([\s\S]*deviceHeading \?\? fallbackHeading,[\s\S]*mapHeading/,
    );
    assert.match(markers, /pointForCoordinate\(coordinate\)/);
    assert.match(markers, /Animated\.timing\(animatedRotation/);
    assert.match(markers, /styles\.compassDirectionOverlay/);
    assert.doesNotMatch(markers, /<Marker[\s\S]*rotation=/);
    assert.match(
      markers,
      /vehicleMarkerHeading:[\s\S]*borderBottomColor: 'rgba\(10, 132, 255, 0\.82\)'/,
    );
  });
});
