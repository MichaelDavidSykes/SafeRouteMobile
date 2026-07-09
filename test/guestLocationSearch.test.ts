import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  parseCoordinateSearch,
  regionToBounds,
  reverseGeocodeGuestLocation,
  searchGuestLocations
} from '../src/features/guest-map/guestLocationSearch';

describe('guest location search', () => {
  it('parses coordinate searches without calling a provider', async () => {
    let requests = 0;
    const results = await searchGuestLocations('-33.9249, 18.4241', {
      request: async () => {
        requests += 1;
        throw new Error('should not be called');
      }
    });

    assert.equal(requests, 0);
    assert.deepEqual(results[0]?.coordinate, {
      latitude: -33.9249,
      longitude: 18.4241
    });
    assert.equal(parseCoordinateSearch('200, 18'), null);
  });

  it('adds a viewport bias and ranks results inside the visible area first', async () => {
    const requestedUrls: string[] = [];
    const results = await searchGuestLocations('Long Street', {
      bias: {
        region: {
          latitude: -33.925,
          longitude: 18.424,
          latitudeDelta: 0.2,
          longitudeDelta: 0.3
        }
      },
      request: async (url) => {
        requestedUrls.push(String(url));
        return {
          ok: true,
          json: async () => [
            {
              place_id: 1,
              display_name: 'Long Street, London, United Kingdom',
              lat: '51.51',
              lon: '-0.12'
            },
            {
              place_id: 2,
              display_name: 'Long Street, Cape Town, South Africa',
              lat: '-33.9251',
              lon: '18.4219'
            }
          ]
        } as Response;
      }
    });

    const url = new URL(requestedUrls[0]);
    assert.equal(url.searchParams.get('bounded'), '0');
    assert.equal(url.searchParams.get('viewbox'), '18.274,-34.025,18.574,-33.825');
    assert.equal(results[0]?.label, 'Long Street');
    assert.equal(results[0]?.displayName, 'Long Street, Cape Town, South Africa');
  });

  it('normalizes, bounds, and deduplicates provider results', async () => {
    const results = await searchGuestLocations('airport', {
      request: async () => ({
        ok: true,
        json: async () => [
          {
            place_id: 9,
            osm_type: 'node',
            osm_id: 4,
            display_name: '  Cape Town International Airport, Cape Town  ',
            lat: '-33.9696',
            lon: '18.5972',
            class: 'aeroway',
            type: 'aerodrome'
          },
          {
            place_id: 9,
            display_name: 'Cape Town International Airport, Cape Town',
            lat: '-33.9696',
            lon: '18.5972'
          },
          { display_name: 'Invalid', lat: 'NaN', lon: '18' }
        ]
      }) as Response
    });

    assert.equal(results.length, 1);
    assert.equal(results[0]?.id, '9-node-4');
    assert.equal(results[0]?.category, 'aeroway / aerodrome');
    assert.deepEqual(results[0]?.coordinate, {
      latitude: -33.9696,
      longitude: 18.5972
    });
  });

  it('uses the LunarChain mobile search proxy and normalizes its envelope', async () => {
    const urls: string[] = [];
    const results = await searchGuestLocations('Cape Town Airport', {
      serviceBaseUrl: 'https://api.lunarchain.net/api/v1/',
      bias: {
        center: { latitude: -33.9249, longitude: 18.4241 },
        region: {
          latitude: -33.9249,
          longitude: 18.4241,
          latitudeDelta: 0.2,
          longitudeDelta: 0.3
        }
      },
      request: async (url) => {
        urls.push(String(url));
        return {
          ok: true,
          json: async () => ({
            data: {
              items: [{
                id: 'tomtom-airport',
                label: 'Cape Town International Airport',
                displayName: 'Cape Town International Airport, Cape Town',
                lat: -33.9696,
                lon: 18.5972,
                category: 'POI'
              }]
            }
          })
        } as Response;
      }
    });

    const url = new URL(urls[0]);
    assert.equal(url.pathname, '/api/v1/mobile/safe-route/locations/search');
    assert.equal(url.searchParams.get('lat'), '-33.9249');
    assert.equal(url.searchParams.get('bbox'), '-34.0249,18.2741,-33.8249,18.5741');
    assert.equal(results[0]?.id, 'tomtom-airport');
    assert.equal(results[0]?.category, 'POI');
  });

  it('reverse geocodes valid dropped pins and fails quietly', async () => {
    const result = await reverseGeocodeGuestLocation(
      { latitude: -33.9249, longitude: 18.4241 },
      {
        request: async () => ({
          ok: true,
          json: async () => ({
            place_id: 12,
            display_name: 'Cape Town City Centre, Cape Town, South Africa',
            lat: '-33.9249',
            lon: '18.4241'
          })
        }) as Response
      }
    );

    assert.equal(result?.label, 'Cape Town City Centre');
    assert.equal(
      await reverseGeocodeGuestLocation(
        { latitude: 120, longitude: 18 },
        { request: async () => ({ ok: true }) as Response }
      ),
      null
    );
  });

  it('returns empty results for blank searches and provider failures', async () => {
    assert.deepEqual(await searchGuestLocations('   '), []);
    assert.deepEqual(
      await searchGuestLocations('London', {
        request: async () => ({ ok: false }) as Response
      }),
      []
    );
  });

  it('converts map regions into stable search bounds', () => {
    const bounds = regionToBounds({
      latitude: 51.5,
      longitude: -0.1,
      latitudeDelta: 0.2,
      longitudeDelta: 0.4
    });

    assert.ok(bounds);
    assert.ok(Math.abs(bounds.south - 51.4) < 0.000001);
    assert.ok(Math.abs(bounds.west - -0.3) < 0.000001);
    assert.ok(Math.abs(bounds.north - 51.6) < 0.000001);
    assert.ok(Math.abs(bounds.east - 0.1) < 0.000001);
  });
});
