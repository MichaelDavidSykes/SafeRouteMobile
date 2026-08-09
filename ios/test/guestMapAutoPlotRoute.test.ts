import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const guestMapSource = readFileSync(
  new URL('../src/features/guest-map/GuestMapScreen.tsx', import.meta.url),
  'utf8',
);

describe('guest route plotting lifecycle', () => {
  it('plots the first selected destination from the updated draft snapshot', () => {
    const selectionStart = guestMapSource.indexOf(
      'const handleSelectLocation =',
    );
    const selectionEnd = guestMapSource.indexOf(
      'const handleManageLocation =',
      selectionStart,
    );
    const selectionHandler = guestMapSource.slice(selectionStart, selectionEnd);

    assert.match(
      selectionHandler,
      /const nextRouteDraft = guestRouteDraftReducer\(routeDraft, selectionAction\)/,
    );
    assert.match(
      selectionHandler,
      /selectedStopId === GUEST_ROUTE_DRAFT_DESTINATION_ID[\s\S]*nextRouteDraft\.waypoints\.length === 0/,
    );
    assert.match(
      selectionHandler,
      /dispatchRouteDraft\(selectionAction\)[\s\S]*handlePlotRoute\(travelMode, nextRouteDraft\)/,
    );
  });

  it('accepts an explicit draft without relying on the previous render state', () => {
    assert.match(
      guestMapSource,
      /const handlePlotRoute = async \([\s\S]*requestedDraft\?: GuestRouteDraft[\s\S]*let plottingDraft = requestedDraft \?\? routeDraft/,
    );
    assert.match(
      guestMapSource,
      /const routeRequestDisabled = !online \|\| routeRequestContextDisabled/,
    );
  });

  it('keeps a valid road-snapped route when optional risk enrichment fails', () => {
    const upgradeStart = guestMapSource.indexOf(
      'const upgradeGuestRouteWithRoadPreview =',
    );
    const upgradeEnd = guestMapSource.indexOf(
      'const handleOpenPreview =',
      upgradeStart,
    );
    const upgradeHandler = guestMapSource.slice(upgradeStart, upgradeEnd);
    const initialPublish = upgradeHandler.indexOf(
      'publishRoadPreview(roadPreview, finalRiskZones)',
    );
    const corridorFetch = upgradeHandler.indexOf('fetchAreaRiskAlongRoute(');

    assert.ok(initialPublish >= 0);
    assert.ok(corridorFetch >= 0);
    assert.ok(initialPublish < corridorFetch);
    assert.match(
      upgradeHandler,
      /provider-snapped route is already visible[\s\S]*optional corridor enrichment is temporarily unavailable/,
    );
    assert.match(
      upgradeHandler,
      /if \(!acceptedRoadPreview && !sessionExpiryHandled && !workspaceUnavailableHandled\)/,
    );
  });
});
