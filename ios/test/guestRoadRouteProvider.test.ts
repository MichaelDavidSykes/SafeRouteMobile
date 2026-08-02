import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildOsrmRouteUrl,
  fetchGuestRoadRoutePreview
} from '../src/features/guest-map/guestRoadRouteProvider';

describe('guest road route provider', () => {
  it('builds OSRM URLs with longitude-latitude waypoint order and full GeoJSON geometry', () => {
    const routeStops = [
      { latitude: 51.5115, longitude: -0.1478 },
      { latitude: 51.5053, longitude: 0.0553 }
    ];
    const url = buildOsrmRouteUrl(routeStops);

    assert.ok(
      url.startsWith('https://router.project-osrm.org/route/v1/driving/-0.1478,51.5115;0.0553,51.5053?')
    );
    assert.match(url, /geometries=geojson/);
    assert.match(url, /overview=full/);
    assert.match(url, /steps=false/);
    assert.match(url, /alternatives=true/);
    assert.ok(
      buildOsrmRouteUrl(routeStops, 'walk').startsWith(
        'https://routing.openstreetmap.de/routed-foot/route/v1/driving/',
      ),
    );
    assert.ok(
      buildOsrmRouteUrl(routeStops, 'cycle').startsWith(
        'https://routing.openstreetmap.de/routed-bike/route/v1/driving/',
      ),
    );
  });

  it('normalizes provider-snapped geometry and preserves exact requested endpoints for markers', async () => {
    const requestedUrls: string[] = [];
    const request = async (url: string) => {
      requestedUrls.push(url);
      return {
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [
            {
              distance: 16497,
              duration: 2304.9,
              geometry: {
                coordinates: [
                  [-0.147766, 51.511505],
                  [-0.147746, 51.511462],
                  [-0.1421, 51.5088],
                  [-0.084, 51.5131],
                  [0.0551, 51.5052]
                ]
              }
            }
          ]
        })
      } as Response;
    };
    const origin = { latitude: 51.5115, longitude: -0.1478 };
    const destination = { latitude: 51.5053, longitude: 0.0553 };

    const preview = await fetchGuestRoadRoutePreview({
      request,
      stops: [origin, destination],
      timeoutMs: 1000
    });

    assert.equal(requestedUrls.length, 1);
    assert.equal(preview?.provider, 'osrm');
    assert.equal(preview?.snapped, true);
    assert.equal(preview?.distanceMeters, 16497);
    assert.equal(preview?.durationSeconds, 2304.9);
    assert.deepEqual(preview?.coordinates[0], origin);
    assert.deepEqual(preview?.coordinates[preview.coordinates.length - 1], destination);
    assert.ok((preview?.coordinates.length || 0) >= 5);
  });

  it('caps dense waypoint requests without dropping the requested destination', () => {
    const stops = Array.from({ length: 32 }, (_, index) => ({
      latitude: 51.45 + index * 0.012,
      longitude: -0.22 + index * 0.011
    }));
    const url = new URL(buildOsrmRouteUrl(stops));
    const requestedCoordinates = url.pathname.split('/').pop()?.split(';') || [];

    assert.equal(requestedCoordinates.length, 25);
    assert.equal(requestedCoordinates[0], '-0.22,51.45');
    assert.equal(requestedCoordinates[requestedCoordinates.length - 1], '0.121,51.822');
    assert.ok(
      requestedCoordinates.includes('-0.088,51.594'),
      'expected capped requests to retain representative intermediate waypoints'
    );
  });

  it('returns null instead of accepting invalid or endpoint-mismatched provider geometry', async () => {
    const request = async () => ({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            geometry: {
              coordinates: [
                [18.4, -33.9],
                [18.5, -33.91]
              ]
            }
          }
        ]
      })
    }) as Response;

    const preview = await fetchGuestRoadRoutePreview({
      request,
      stops: [
        { latitude: 51.5115, longitude: -0.1478 },
        { latitude: 51.5053, longitude: 0.0553 }
      ],
      timeoutMs: 1000
    });

    assert.equal(preview, null);
  });

  it('selects a safe provider alternative when the fastest route crosses an avoid area', async () => {
    const request = async () => ({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            distance: 1000,
            duration: 100,
            geometry: {
              coordinates: [
                [18.4, -33.9],
                [18.45, -33.95],
                [18.5, -34]
              ]
            }
          },
          {
            distance: 1400,
            duration: 140,
            geometry: {
              coordinates: [
                [18.4, -33.9],
                [18.39, -34],
                [18.5, -34]
              ]
            }
          }
        ]
      })
    }) as Response;

    const preview = await fetchGuestRoadRoutePreview({
      avoidRectangles: [{
        minLatitude: -33.97,
        maxLatitude: -33.93,
        minLongitude: 18.43,
        maxLongitude: 18.47
      }],
      request,
      stops: [
        { latitude: -33.9, longitude: 18.4 },
        { latitude: -34, longitude: 18.5 }
      ]
    });

    assert.ok(preview);
    assert.equal(preview.durationSeconds, 140);
    assert.deepEqual(preview.coordinates[1], { latitude: -34, longitude: 18.39 });
  });

  it('fails closed when every provider alternative crosses a mandatory avoid area', async () => {
    const preview = await fetchGuestRoadRoutePreview({
      avoidRectangles: [{
        minLatitude: -33.97,
        maxLatitude: -33.93,
        minLongitude: 18.43,
        maxLongitude: 18.47
      }],
      request: async () => ({
        ok: true,
        json: async () => ({
          code: 'Ok',
          routes: [{
            distance: 1000,
            duration: 100,
            geometry: {
              coordinates: [
                [18.4, -33.9],
                [18.45, -33.95],
                [18.5, -34]
              ]
            }
          }]
        })
      }) as Response,
      stops: [
        { latitude: -33.9, longitude: 18.4 },
        { latitude: -34, longitude: 18.5 }
      ]
    });

    assert.equal(preview, null);
  });

  it('fails closed for invalid stop lists, provider errors, and failed responses', async () => {
    assert.throws(
      () => buildOsrmRouteUrl([{ latitude: 51.5115, longitude: -0.1478 }]),
      /two valid stops/i
    );

    assert.equal(
      await fetchGuestRoadRoutePreview({
        request: async () => {
          throw new Error('network unavailable');
        },
        stops: [
          { latitude: 51.5115, longitude: -0.1478 },
          { latitude: 51.5053, longitude: 0.0553 }
        ],
        timeoutMs: 1000
      }),
      null
    );

    assert.equal(
      await fetchGuestRoadRoutePreview({
        request: async () => ({ ok: false }) as Response,
        stops: [
          { latitude: 51.5115, longitude: -0.1478 },
          { latitude: 51.5053, longitude: 0.0553 }
        ],
        timeoutMs: 1000
      }),
      null
    );

    assert.equal(
      await fetchGuestRoadRoutePreview({
        stops: [{ latitude: 91, longitude: -0.1478 }],
        timeoutMs: 1000
      }),
      null
    );
  });
});
