import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MAX_MOBILE_SUPPORT_FACILITIES,
  normalizeMobileSupportFacilities,
  supportFacilityCalloutDescription,
} from '../src/features/live-map/supportFacilities';

describe('mobile SafeRoute support facilities', () => {
  it('normalizes hospital, police, and safe-haven locations from the shared web provider', () => {
    const facilities = normalizeMobileSupportFacilities([
      {
        id: 'hospital-1',
        label: 'Route Hospital',
        kind: 'hospital',
        lat: -33.93,
        lon: 18.44,
        distance_m: 85,
        route_distance_km: 4.2,
        source: 'OpenStreetMap',
      },
      {
        id: 'safe-1',
        label: 'Fire station',
        kind: 'safe_haven',
        latitude: -33.94,
        longitude: 18.45,
      },
      {
        id: 'police-1',
        label: 'Police station',
        kind: 'police',
        coordinate: { latitude: -33.95, longitude: 18.46 },
      },
    ]);

    assert.deepEqual(facilities.map(({ kind }) => kind), [
      'hospital',
      'safe-haven',
      'police',
    ]);
    assert.equal(facilities[0]?.distanceMeters, 85);
    assert.match(
      supportFacilityCalloutDescription(facilities[0]!),
      /Hospital · 85 m from route/,
    );
  });

  it('deduplicates, rejects malformed facilities, and keeps map work bounded', () => {
    const input = Array.from({ length: MAX_MOBILE_SUPPORT_FACILITIES + 20 }, (_, index) => ({
      id: `hospital-${index}`,
      label: `Hospital ${index}`,
      kind: 'hospital',
      lat: -33.9 + index / 10000,
      lon: 18.4,
    }));
    input.push({ ...input[0]!, label: 'Duplicate' });
    input.push({ id: 'bad', label: 'Bad', kind: 'hospital', lat: 91, lon: 0 });

    const facilities = normalizeMobileSupportFacilities(input);

    assert.equal(facilities.length, MAX_MOBILE_SUPPORT_FACILITIES);
    assert.equal(new Set(facilities.map(({ id }) => id)).size, facilities.length);
  });
});
