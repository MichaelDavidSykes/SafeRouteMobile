import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GUEST_ROUTE_DRAFT_DESTINATION_ID,
  GUEST_ROUTE_DRAFT_ORIGIN_ID,
  createGuestRouteDraft,
  editGuestRouteDraftStop,
  exportGuestRouteDraftCoordinates,
  setGuestRouteDestination
} from '../src/features/guest-map/guestRouteDraft';
import { resolveGuestRouteDraftSearchInputs } from '../src/features/guest-map/guestRouteDraftResolution';

describe('guest route draft search resolution', () => {
  it('resolves a typed custom origin before plotting a selected destination', async () => {
    let draft = createGuestRouteDraft();
    draft = editGuestRouteDraftStop(draft, GUEST_ROUTE_DRAFT_ORIGIN_ID, 'Victoria Station');
    draft = setGuestRouteDestination(draft, {
      coordinate: { latitude: 51.5053, longitude: 0.0553 },
      label: 'London City Airport'
    });

    const resolved = await resolveGuestRouteDraftSearchInputs({
      draft,
      search: async (query) => query === 'Victoria Station'
        ? [{
            category: 'railway',
            coordinate: { latitude: 51.4952, longitude: -0.1439 },
            displayName: 'London Victoria Station',
            id: 'victoria-station',
            label: 'Victoria Station'
          }]
        : []
    });

    assert.deepEqual(exportGuestRouteDraftCoordinates(resolved), [
      { latitude: 51.4952, longitude: -0.1439 },
      { latitude: 51.5053, longitude: 0.0553 }
    ]);
    assert.equal(resolved.origin.label, 'London Victoria Station');
  });

  it('leaves unmatched inputs unresolved instead of plotting guessed coordinates', async () => {
    const draft = setGuestRouteDestination(createGuestRouteDraft({
      currentLocation: { latitude: 51.5, longitude: -0.12 }
    }), {
      label: 'Unknown destination'
    });

    const resolved = await resolveGuestRouteDraftSearchInputs({
      draft,
      search: async () => []
    });

    assert.equal(exportGuestRouteDraftCoordinates(resolved), null);
    assert.equal(resolved.destination.id, GUEST_ROUTE_DRAFT_DESTINATION_ID);
  });
});
