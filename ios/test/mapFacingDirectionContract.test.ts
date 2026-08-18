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
      /currentLocationVisible && liveCoordinate[\s\S]*<CompassTrackedMarker[\s\S]*guestMapCurrentLocationMarker/,
    );
    assert.match(guestMap, /showsUserLocation=\{false\}/);
    assert.match(
      guestMap,
      /<CompassTrackedMarker[\s\S]*enabled=\{permissionStatus === 'granted'\}[\s\S]*mapHeading=\{mapCameraHeadingDegrees\}/,
    );
    assert.doesNotMatch(guestMap, /pointForCoordinate|CompassTrackedHeadingOverlay/);
  });

  it('keeps compass-facing direction separate from navigation camera bearing', () => {
    const liveMap = source('features/live-map/LiveMapScreen.tsx');
    const liveCanvas = source('features/live-map/LiveMapCanvas.tsx');

    assert.match(
      liveCanvas,
      /<CompassTrackedMarker[\s\S]*demoDriveEnabled=\{demoDriveActive\}/,
    );
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
    assert.match(liveCanvas, /showsUserLocation=\{false\}/);
  });

  it('keeps position and direction in one stable map annotation', () => {
    const markers = source('features/live-map/LiveMapMarkers.tsx');
    const vehicleMarker = markers.slice(
      markers.indexOf('export function VehicleMarker'),
      markers.indexOf('export function createVehicleMarkerAccessibilityLabel'),
    );

    assert.match(markers, /useDeviceHeading\(enabled, \{[\s\S]*minimumUpdateIntervalMs: 120/);
    assert.match(vehicleMarker, /<Marker/);
    assert.match(vehicleMarker, /tracksViewChanges=\{screenRotation !== null\}/);
    assert.match(vehicleMarker, /transform: \[\{ rotate: `\$\{screenRotation\}deg` \}\]/);
    assert.match(vehicleMarker, /styles\.vehicleMarkerHeadingBeam/);
    assert.doesNotMatch(markers, /pointForCoordinate|VehicleHeadingOverlay/);
    assert.doesNotMatch(markers, /Animated\.View|shouldRasterizeIOS|renderToHardwareTextureAndroid/);
    assert.doesNotMatch(markers, /CompassDirectionPolygon/);
    assert.doesNotMatch(markers, /<Marker[\s\S]*rotation=/);
    assert.match(
      markers,
      /backgroundColor: colors\.appleBlue/,
    );
  });
});
