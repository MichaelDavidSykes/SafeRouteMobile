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
      /showsUserLocation=\{currentLocationVisible\}/,
    );
    assert.match(
      guestMap,
      /<\/MapView>[\s\S]*<CompassTrackedHeadingOverlay[\s\S]*enabled=\{permissionStatus === 'granted'\}[\s\S]*mapHeading=\{mapCameraHeadingDegrees\}/,
    );
    assert.match(guestMap, /onUserLocationChange=[\s\S]*nativeUserCoordinate \|\| liveCoordinate/);
    assert.doesNotMatch(guestMap, /<CompassTrackedMarker|<VehicleMarker[\s\S]*guestMapCurrentLocationMarker/);
  });

  it('keeps compass-facing direction separate from navigation camera bearing', () => {
    const liveMap = source('features/live-map/LiveMapScreen.tsx');
    const liveCanvas = source('features/live-map/LiveMapCanvas.tsx');

    assert.match(
      liveCanvas,
      /showsUserLocation=\{!demoDriveActive && permissionStatus === "granted"\}/,
    );
    assert.match(
      liveCanvas,
      /<\/MapView>[\s\S]*<CompassTrackedHeadingOverlay[\s\S]*enabled=\{permissionStatus === "granted"\}/,
    );
    assert.match(
      liveCanvas,
      /fallbackHeading=\{heading\}/,
    );
    assert.match(
      liveMap,
      /<LiveMapCanvas[\s\S]*heading=\{heading\}/,
    );
    assert.match(liveCanvas, /vehicleCoordinate && demoDriveActive[\s\S]*<VehicleMarker/);
    assert.match(liveCanvas, /onUserLocationChange=[\s\S]*nativeUserCoordinate \|\| vehicleCoordinate/);
  });

  it('keeps the native location puck independent from the heading fan', () => {
    const markers = source('features/live-map/LiveMapMarkers.tsx');
    const vehicleMarker = markers.slice(
      markers.indexOf('export function VehicleMarker'),
      markers.indexOf('export function createVehicleMarkerAccessibilityLabel'),
    );

    assert.match(markers, /useDeviceHeading\(enabled, \{[\s\S]*minimumUpdateIntervalMs: 120/);
    assert.match(vehicleMarker, /<Marker/);
    assert.match(vehicleMarker, /tracksViewChanges=\{false\}/);
    assert.match(markers, /map\.pointForCoordinate\(coordinate\)/);
    assert.match(markers, /styles\.vehicleHeadingOverlay/);
    assert.match(markers, /LinearGradient id="nativePuckHeadingFan"/);
    assert.match(markers, /Animated\.timing\(animatedRotation/);
    assert.match(markers, /useNativeDriver: true/);
    assert.doesNotMatch(markers, /shouldRasterizeIOS|renderToHardwareTextureAndroid/);
    assert.doesNotMatch(vehicleMarker, /screenRotation|useDeviceHeading|Animated\.View/);
    assert.doesNotMatch(markers, /CompassDirectionPolygon/);
    assert.doesNotMatch(markers, /<Marker[\s\S]*rotation=/);
    assert.match(markers, /backgroundColor: colors\.appleBlue/);
  });
});
