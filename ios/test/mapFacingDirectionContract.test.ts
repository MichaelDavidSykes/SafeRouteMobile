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
      /currentLocationVisible && liveCoordinate[\s\S]*<VehicleMarker[\s\S]*guestMapCurrentLocationMarker/,
    );
    assert.match(guestMap, /showsUserLocation=\{false\}/);
    assert.match(
      guestMap,
      /<\/MapView>[\s\S]*<CompassTrackedHeadingOverlay/,
    );
    assert.match(
      guestMap,
      /<CompassTrackedHeadingOverlay[\s\S]*enabled=\{permissionStatus === 'granted'\}[\s\S]*mapHeading=\{mapCameraHeadingDegrees\}[\s\S]*mapRef=\{mapRef\}[\s\S]*projectionRevision=\{compassProjectionRevision\}/,
    );
  });

  it('keeps compass-facing direction separate from navigation camera bearing', () => {
    const liveMap = source('features/live-map/LiveMapScreen.tsx');
    const liveCanvas = source('features/live-map/LiveMapCanvas.tsx');

    assert.match(
      liveCanvas,
      /<VehicleMarker[\s\S]*demoDriveEnabled=\{demoDriveActive\}[\s\S]*<\/MapView>[\s\S]*<CompassTrackedHeadingOverlay/,
    );
    assert.match(
      liveCanvas,
      /<CompassTrackedHeadingOverlay[\s\S]*enabled=\{!demoDriveActive && permissionStatus === "granted"\}/,
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

  it('keeps a static MapKit puck and rotates the Apple-style beam above the map', () => {
    const markers = source('features/live-map/LiveMapMarkers.tsx');
    const staticMarker = markers.slice(
      markers.indexOf('export function VehicleMarker'),
      markers.indexOf('export function createVehicleMarkerAccessibilityLabel'),
    );

    assert.match(markers, /useDeviceHeading\(enabled, \{[\s\S]*minimumUpdateIntervalMs: 80/);
    assert.match(markers, /map\.pointForCoordinate\(coordinate\)/);
    assert.match(markers, /styles\.vehicleHeadingOverlay/);
    assert.match(markers, /styles\.vehicleMarkerDirection/);
    assert.match(markers, /LinearGradient id="appleHeadingBeam"/);
    assert.match(markers, /Animated\.timing\(animatedRotation/);
    assert.match(markers, /useNativeDriver: true/);
    assert.match(markers, /renderToHardwareTextureAndroid/);
    assert.match(markers, /shouldRasterizeIOS/);
    assert.match(staticMarker, /<Marker/);
    assert.doesNotMatch(staticMarker, /Animated\.View|appleHeadingBeam|useDeviceHeading/);
    assert.doesNotMatch(markers, /CompassDirectionPolygon/);
    assert.doesNotMatch(markers, /<Marker[\s\S]*rotation=/);
    assert.match(
      markers,
      /backgroundColor: colors\.appleBlue/,
    );
  });
});
