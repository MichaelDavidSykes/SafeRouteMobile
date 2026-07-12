import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  GUEST_ROUTE_DRAFT_DESTINATION_ID,
  GUEST_ROUTE_DRAFT_MAX_STOPS,
  GUEST_ROUTE_DRAFT_ORIGIN_ID,
  addGuestRouteWaypoint,
  canAddGuestRouteWaypoint,
  canExportGuestRouteDraft,
  createGuestRouteDraft,
  editGuestRouteDraftStop,
  exportGuestRouteDraftCoordinates,
  getGuestRouteDraftUnresolvedStopIds,
  getOrderedGuestRouteDraftStops,
  guestRouteDraftReducer,
  hasUnresolvedGuestRouteDraftInput,
  mapGuestRouteDraftToCheckpoints,
  removeGuestRouteWaypoint,
  reorderGuestRouteWaypoint,
  resolveGuestRouteDraftStopCoordinate,
  selectGuestRouteDraftLocation,
  setGuestRouteCurrentLocation,
  setGuestRouteDestination,
  setGuestRouteOrigin,
  setGuestRouteWaypoint,
  setSelectedGuestRouteDraftStop,
  shouldUseGuestMapSelectionAsDestination,
  useGuestRouteCurrentLocation
} from '../src/features/guest-map/guestRouteDraft';

const originSelection = {
  coordinate: { latitude: 51.5074, longitude: -0.1278 },
  label: 'Charing Cross, London'
};

const waypointSelections = [
  {
    coordinate: { latitude: 51.5155, longitude: -0.0922 },
    label: 'St Paul’s Cathedral, London'
  },
  {
    coordinate: { latitude: 51.5133, longitude: -0.0889 },
    label: 'Bank Station, London'
  }
];

const destinationSelection = {
  coordinate: { latitude: 51.5053, longitude: 0.0553 },
  label: 'London City Airport'
};

describe('guest route draft state', () => {
  it('uses the first held map point as the destination instead of an incomplete waypoint', () => {
    const initial = createGuestRouteDraft({ currentLocation: originSelection.coordinate });
    assert.equal(shouldUseGuestMapSelectionAsDestination(initial), true);

    const withDestination = selectGuestRouteDraftLocation(
      initial,
      GUEST_ROUTE_DRAFT_DESTINATION_ID,
      destinationSelection
    );
    assert.equal(shouldUseGuestMapSelectionAsDestination(withDestination), false);
    assert.equal(canExportGuestRouteDraft(withDestination), true);

    const editedDestination = editGuestRouteDraftStop(
      withDestination,
      GUEST_ROUTE_DRAFT_DESTINATION_ID,
      'Choose another point'
    );
    assert.equal(shouldUseGuestMapSelectionAsDestination(editedDestination), true);
  });

  it('keeps fixed endpoint IDs and monotonic waypoint IDs across edits and removal', () => {
    let draft = createGuestRouteDraft();
    assert.equal(draft.origin.id, GUEST_ROUTE_DRAFT_ORIGIN_ID);
    assert.equal(draft.destination.id, GUEST_ROUTE_DRAFT_DESTINATION_ID);

    draft = addGuestRouteWaypoint(draft);
    draft = addGuestRouteWaypoint(draft);
    const [firstWaypoint, secondWaypoint] = draft.waypoints;

    assert.equal(firstWaypoint.id, 'guest-waypoint-1');
    assert.equal(secondWaypoint.id, 'guest-waypoint-2');

    const edited = editGuestRouteDraftStop(draft, firstWaypoint.id, '  Museum  ');
    assert.equal(edited.waypoints[0].id, firstWaypoint.id);

    const removed = removeGuestRouteWaypoint(edited, firstWaypoint.id);
    const readded = addGuestRouteWaypoint(removed);
    assert.deepEqual(
      readded.waypoints.map((waypoint) => waypoint.id),
      ['guest-waypoint-2', 'guest-waypoint-3']
    );
    assert.equal(readded.origin.id, GUEST_ROUTE_DRAFT_ORIGIN_ID);
    assert.equal(readded.destination.id, GUEST_ROUTE_DRAFT_DESTINATION_ID);
  });

  it('sets, selects, and edits stops without retaining stale coordinates', () => {
    const initial = createGuestRouteDraft({ currentLocation: originSelection.coordinate });
    const typed = setGuestRouteDestination(initial, {
      label: destinationSelection.label
    });

    assert.equal(typed.destination.label, destinationSelection.label);
    assert.equal(resolveGuestRouteDraftStopCoordinate(typed, typed.destination.id), null);
    assert.equal(hasUnresolvedGuestRouteDraftInput(typed), true);
    assert.deepEqual(getGuestRouteDraftUnresolvedStopIds(typed), [typed.destination.id]);
    assert.equal(exportGuestRouteDraftCoordinates(typed), null);

    const selected = selectGuestRouteDraftLocation(
      typed,
      GUEST_ROUTE_DRAFT_DESTINATION_ID,
      destinationSelection
    );
    assert.deepEqual(
      resolveGuestRouteDraftStopCoordinate(selected, selected.destination.id),
      destinationSelection.coordinate
    );
    assert.equal(canExportGuestRouteDraft(selected), true);

    const edited = editGuestRouteDraftStop(
      selected,
      GUEST_ROUTE_DRAFT_DESTINATION_ID,
      'London City'
    );
    assert.equal(resolveGuestRouteDraftStopCoordinate(edited, edited.destination.id), null);
    assert.equal(canExportGuestRouteDraft(edited), false);

    assert.deepEqual(
      resolveGuestRouteDraftStopCoordinate(selected, selected.destination.id),
      destinationSelection.coordinate
    );
    assert.equal(selected.destination.label, destinationSelection.label);
  });

  it('resolves current location and keeps it independent from explicit origin selection', () => {
    const pending = createGuestRouteDraft();
    assert.equal(resolveGuestRouteDraftStopCoordinate(pending, pending.origin.id), null);
    assert.equal(hasUnresolvedGuestRouteDraftInput(pending), true);

    const resolved = setGuestRouteCurrentLocation(pending, originSelection.coordinate);
    assert.deepEqual(
      resolveGuestRouteDraftStopCoordinate(resolved, resolved.origin.id),
      originSelection.coordinate
    );

    const selected = setGuestRouteOrigin(resolved, originSelection);
    const laterLocationUpdate = setGuestRouteCurrentLocation(selected, {
      latitude: 52,
      longitude: -1
    });
    assert.deepEqual(
      resolveGuestRouteDraftStopCoordinate(laterLocationUpdate, laterLocationUpdate.origin.id),
      originSelection.coordinate
    );

    const usingCurrentLocationAgain = useGuestRouteCurrentLocation(laterLocationUpdate);
    assert.deepEqual(
      resolveGuestRouteDraftStopCoordinate(
        usingCurrentLocationAgain,
        usingCurrentLocationAgain.origin.id
      ),
      { latitude: 52, longitude: -1 }
    );
  });

  it('adds, selects, reorders, and removes only waypoints while preserving IDs', () => {
    let draft = createGuestRouteDraft({
      currentLocation: originSelection.coordinate,
      destination: destinationSelection
    });
    draft = addGuestRouteWaypoint(draft, {
      ...waypointSelections[0],
      select: false
    });
    draft = addGuestRouteWaypoint(draft, waypointSelections[1]);

    const firstId = draft.waypoints[0].id;
    const secondId = draft.waypoints[1].id;
    assert.equal(draft.selectedStopId, secondId);

    const selectedFirst = setSelectedGuestRouteDraftStop(draft, firstId);
    assert.equal(selectedFirst.selectedStopId, firstId);

    const reordered = reorderGuestRouteWaypoint(selectedFirst, secondId, 0);
    assert.deepEqual(
      reordered.waypoints.map((waypoint) => waypoint.id),
      [secondId, firstId]
    );
    assert.deepEqual(
      selectedFirst.waypoints.map((waypoint) => waypoint.id),
      [firstId, secondId]
    );

    const updated = setGuestRouteWaypoint(reordered, firstId, {
      coordinate: { latitude: 51.52, longitude: -0.1 },
      label: 'Updated waypoint'
    });
    assert.equal(updated.waypoints[1].id, firstId);

    assert.equal(removeGuestRouteWaypoint(updated, GUEST_ROUTE_DRAFT_ORIGIN_ID), updated);
    const removed = removeGuestRouteWaypoint(updated, firstId);
    assert.deepEqual(removed.waypoints.map((waypoint) => waypoint.id), [secondId]);
    assert.equal(removed.selectedStopId, null);
  });

  it('exports resolved coordinates and checkpoints in route order', () => {
    let draft = createGuestRouteDraft({
      origin: originSelection,
      destination: destinationSelection
    });
    draft = addGuestRouteWaypoint(draft, waypointSelections[0]);
    draft = addGuestRouteWaypoint(draft, waypointSelections[1]);

    assert.deepEqual(
      getOrderedGuestRouteDraftStops(draft).map((stop) => stop.kind),
      ['origin', 'waypoint', 'waypoint', 'destination']
    );
    assert.deepEqual(exportGuestRouteDraftCoordinates(draft), [
      originSelection.coordinate,
      waypointSelections[0].coordinate,
      waypointSelections[1].coordinate,
      destinationSelection.coordinate
    ]);
    assert.deepEqual(mapGuestRouteDraftToCheckpoints(draft), [
      {
        id: GUEST_ROUTE_DRAFT_ORIGIN_ID,
        label: 'A',
        caption: originSelection.label,
        coordinate: originSelection.coordinate,
        kind: 'origin'
      },
      {
        id: 'guest-waypoint-1',
        label: '1',
        caption: waypointSelections[0].label,
        coordinate: waypointSelections[0].coordinate,
        kind: 'waypoint'
      },
      {
        id: 'guest-waypoint-2',
        label: '2',
        caption: waypointSelections[1].label,
        coordinate: waypointSelections[1].coordinate,
        kind: 'waypoint'
      },
      {
        id: GUEST_ROUTE_DRAFT_DESTINATION_ID,
        label: 'B',
        caption: destinationSelection.label,
        coordinate: destinationSelection.coordinate,
        kind: 'destination'
      }
    ]);
  });

  it('blocks export for unresolved waypoint input', () => {
    let draft = createGuestRouteDraft({
      origin: originSelection,
      destination: destinationSelection
    });
    draft = addGuestRouteWaypoint(draft, { label: 'Typed but not selected' });

    assert.deepEqual(getGuestRouteDraftUnresolvedStopIds(draft), ['guest-waypoint-1']);
    assert.equal(hasUnresolvedGuestRouteDraftInput(draft), true);
    assert.equal(canExportGuestRouteDraft(draft), false);
    assert.equal(exportGuestRouteDraftCoordinates(draft), null);
    assert.equal(mapGuestRouteDraftToCheckpoints(draft), null);
  });

  it('enforces the maximum stop count without reusing IDs', () => {
    let draft = createGuestRouteDraft();

    while (canAddGuestRouteWaypoint(draft)) {
      draft = addGuestRouteWaypoint(draft);
    }

    assert.equal(getOrderedGuestRouteDraftStops(draft).length, GUEST_ROUTE_DRAFT_MAX_STOPS);
    assert.equal(
      draft.waypoints.at(-1)?.id,
      `guest-waypoint-${GUEST_ROUTE_DRAFT_MAX_STOPS - 2}`
    );
    assert.equal(canAddGuestRouteWaypoint(draft), false);
    assert.equal(addGuestRouteWaypoint(draft), draft);
  });

  it('supports immutable reducer actions for the same state transitions', () => {
    const initial = createGuestRouteDraft();
    const withLocation = guestRouteDraftReducer(initial, {
      type: 'current-location/set',
      coordinate: originSelection.coordinate
    });
    const withDestination = guestRouteDraftReducer(withLocation, {
      type: 'stop/select',
      stopId: GUEST_ROUTE_DRAFT_DESTINATION_ID,
      selection: destinationSelection
    });
    const withWaypoint = guestRouteDraftReducer(withDestination, {
      type: 'waypoint/add',
      options: waypointSelections[0]
    });
    const editedWaypoint = guestRouteDraftReducer(withWaypoint, {
      type: 'stop/edit',
      stopId: withWaypoint.waypoints[0].id,
      label: 'St Paul’s'
    });

    assert.equal(initial.currentLocation, null);
    assert.equal(withDestination.waypoints.length, 0);
    assert.equal(withWaypoint.waypoints[0].resolution.type, 'coordinate');
    assert.equal(editedWaypoint.waypoints[0].resolution.type, 'unresolved');
    assert.equal(mapGuestRouteDraftToCheckpoints(editedWaypoint), null);
  });
});
