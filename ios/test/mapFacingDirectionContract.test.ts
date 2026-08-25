import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
}

describe('map facing-direction indicator', () => {
  it('hands the planning-map location puck and heading to native MapKit', () => {
    const guestMap = source('features/guest-map/GuestMapScreen.tsx');

    assert.match(
      guestMap,
      /showsUserLocation=\{permissionStatus === 'granted'\}/,
    );
    assert.match(
      guestMap,
      /Platform\.OS === 'ios' && permissionStatus === 'granted'[\s\S]*showsUserHeadingIndicator: true/,
    );
    assert.doesNotMatch(
      guestMap,
      /CompassTrackedHeadingOverlay|onUserLocationChange|nativeUserCoordinate|mapCameraHeadingDegrees/,
    );
  });

  it('keeps native location rendering separate from navigation camera logic', () => {
    const liveMap = source('features/live-map/LiveMapScreen.tsx');
    const liveCanvas = source('features/live-map/LiveMapCanvas.tsx');

    assert.match(
      liveCanvas,
      /showsUserLocation=\{!demoDriveActive && permissionStatus === "granted"\}/,
    );
    assert.match(
      liveCanvas,
      /Platform\.OS === "ios" && !demoDriveActive && permissionStatus === "granted"[\s\S]*showsUserHeadingIndicator: true/,
    );
    assert.match(
      liveCanvas,
      /<VehicleMarker[\s\S]*coordinate=\{vehicleCoordinate \|\| routeCoordinates\[0\]\}[\s\S]*visible=\{Boolean\(vehicleCoordinate && demoDriveActive\)\}/,
    );
    assert.doesNotMatch(
      liveCanvas,
      /CompassTrackedHeadingOverlay|onUserLocationChange|nativeUserCoordinate|mapCameraHeadingDegrees/,
    );
    assert.doesNotMatch(liveMap, /<LiveMapCanvas[\s\S]*heading=\{heading\}/);
  });

  it('attaches the native heading fan directly to MKUserLocationView', () => {
    const markers = source('features/live-map/LiveMapMarkers.tsx');
    const nativePatch = readFileSync(
      new URL('../patches/react-native-maps+1.20.1.patch', import.meta.url),
      'utf8',
    );

    assert.doesNotMatch(
      markers,
      /VehicleHeadingOverlay|CompassTrackedHeadingOverlay|useDeviceHeading|pointForCoordinate/,
    );
    assert.match(nativePatch, /RCT_EXPORT_VIEW_PROPERTY\(showsUserHeadingIndicator, BOOL\)/);
    assert.match(nativePatch, /attachUserHeadingIndicatorToAnnotationView/);
    assert.match(nativePatch, /viewForAnnotation:self\.userLocation/);
    assert.match(nativePatch, /didUpdateHeading/);
    assert.match(nativePatch, /self\.lastUserHeadingDegrees - self\.camera\.heading/);
    assert.match(nativePatch, /insertSubview:indicator atIndex:0/);
  });
});
