import type { LatLng } from 'react-native-maps';

import type { RouteCheckpoint } from '../live-map/liveMapTypes';

export const GUEST_ROUTE_DRAFT_ORIGIN_ID = 'guest-origin';
export const GUEST_ROUTE_DRAFT_DESTINATION_ID = 'guest-destination';
export const GUEST_ROUTE_DRAFT_WAYPOINT_ID_PREFIX = 'guest-waypoint-';
export const GUEST_ROUTE_DRAFT_CURRENT_LOCATION_LABEL = 'Current location';

// Keep the editable draft within the same stop budget as the road-route provider.
export const GUEST_ROUTE_DRAFT_MAX_STOPS = 25;

export type GuestRouteDraftStopKind = RouteCheckpoint['kind'];

export type GuestRouteDraftStopResolution =
  | { type: 'unresolved' }
  | { type: 'current-location' }
  | { coordinate: LatLng; type: 'coordinate' };

export type GuestRouteDraftStop = {
  id: string;
  kind: GuestRouteDraftStopKind;
  label: string;
  reorderKey: string;
  resolution: GuestRouteDraftStopResolution;
};

export type GuestRouteDraft = {
  currentLocation: LatLng | null;
  destination: GuestRouteDraftStop;
  nextWaypointSequence: number;
  origin: GuestRouteDraftStop;
  selectedStopId: string | null;
  waypoints: readonly GuestRouteDraftStop[];
};

export type GuestRouteDraftStopValue = {
  coordinate?: LatLng | null;
  label: string;
  useCurrentLocation?: boolean;
};

export type GuestRouteDraftLocationSelection = {
  coordinate: LatLng;
  label: string;
};

export type AddGuestRouteWaypointOptions = {
  coordinate?: LatLng | null;
  index?: number;
  label?: string;
  select?: boolean;
};

export type CreateGuestRouteDraftOptions = {
  currentLocation?: LatLng | null;
  destination?: GuestRouteDraftStopValue;
  origin?: GuestRouteDraftStopValue;
};

export type GuestRouteDraftAction =
  | { stopId: string; type: 'stop/edit'; label: string }
  | { stopId: string; type: 'stop/select'; selection: GuestRouteDraftLocationSelection }
  | { stopId: string | null; type: 'stop/set-selected' }
  | { stopId: string; type: 'stop/set'; value: GuestRouteDraftStopValue }
  | { type: 'origin/use-current-location'; label?: string }
  | { coordinate: LatLng | null; type: 'current-location/set' }
  | { options?: AddGuestRouteWaypointOptions; type: 'waypoint/add' }
  | { waypointId: string; type: 'waypoint/remove' }
  | { toIndex: number; type: 'waypoint/reorder'; waypointId: string }
  | { stopId: string; toIndex: number; type: 'stop/reorder' };

export function createGuestRouteDraft(
  options: CreateGuestRouteDraftOptions = {}
): GuestRouteDraft {
  let draft: GuestRouteDraft = {
    currentLocation: copyValidCoordinate(options.currentLocation),
    destination: createStop(
      GUEST_ROUTE_DRAFT_DESTINATION_ID,
      'destination',
      '',
      unresolvedResolution()
    ),
    nextWaypointSequence: 1,
    origin: createStop(
      GUEST_ROUTE_DRAFT_ORIGIN_ID,
      'origin',
      GUEST_ROUTE_DRAFT_CURRENT_LOCATION_LABEL,
      currentLocationResolution()
    ),
    selectedStopId: null,
    waypoints: []
  };

  if (options.origin) {
    draft = setGuestRouteDraftStop(draft, GUEST_ROUTE_DRAFT_ORIGIN_ID, options.origin);
  }

  if (options.destination) {
    draft = setGuestRouteDraftStop(
      draft,
      GUEST_ROUTE_DRAFT_DESTINATION_ID,
      options.destination
    );
  }

  return draft;
}

export function getOrderedGuestRouteDraftStops(
  draft: GuestRouteDraft
): readonly GuestRouteDraftStop[] {
  return [draft.origin, ...draft.waypoints, draft.destination];
}

export function findGuestRouteDraftStop(
  draft: GuestRouteDraft,
  stopId: string
): GuestRouteDraftStop | null {
  if (stopId === draft.origin.id) {
    return draft.origin;
  }

  if (stopId === draft.destination.id) {
    return draft.destination;
  }

  return draft.waypoints.find((waypoint) => waypoint.id === stopId) ?? null;
}

export function setGuestRouteDraftStop(
  draft: GuestRouteDraft,
  stopId: string,
  value: GuestRouteDraftStopValue
): GuestRouteDraft {
  const stop = findGuestRouteDraftStop(draft, stopId);
  if (!stop) {
    return draft;
  }

  const resolution = createResolution(stop.kind, value);
  return replaceStop(draft, stopId, {
    ...stop,
    label:
      resolution.type === 'current-location' && !hasInput(value.label)
        ? GUEST_ROUTE_DRAFT_CURRENT_LOCATION_LABEL
        : value.label,
    resolution
  });
}

export function setGuestRouteOrigin(
  draft: GuestRouteDraft,
  value: GuestRouteDraftStopValue
): GuestRouteDraft {
  return setGuestRouteDraftStop(draft, GUEST_ROUTE_DRAFT_ORIGIN_ID, value);
}

export function setGuestRouteDestination(
  draft: GuestRouteDraft,
  value: GuestRouteDraftStopValue
): GuestRouteDraft {
  return setGuestRouteDraftStop(draft, draft.destination.id, value);
}

export function setGuestRouteWaypoint(
  draft: GuestRouteDraft,
  waypointId: string,
  value: GuestRouteDraftStopValue
): GuestRouteDraft {
  const waypoint = findGuestRouteDraftStop(draft, waypointId);
  return waypoint?.kind === 'waypoint'
    ? setGuestRouteDraftStop(draft, waypointId, value)
    : draft;
}

export function editGuestRouteDraftStop(
  draft: GuestRouteDraft,
  stopId: string,
  label: string
): GuestRouteDraft {
  const stop = findGuestRouteDraftStop(draft, stopId);
  if (!stop || stop.label === label) {
    return draft;
  }

  return replaceStop(draft, stopId, {
    ...stop,
    label,
    resolution: unresolvedResolution()
  });
}

export function selectGuestRouteDraftLocation(
  draft: GuestRouteDraft,
  stopId: string,
  selection: GuestRouteDraftLocationSelection
): GuestRouteDraft {
  const selected = setGuestRouteDraftStop(draft, stopId, selection);
  return selected === draft
    ? draft
    : {
        ...selected,
        selectedStopId: stopId
      };
}

export function setSelectedGuestRouteDraftStop(
  draft: GuestRouteDraft,
  stopId: string | null
): GuestRouteDraft {
  if (stopId !== null && !findGuestRouteDraftStop(draft, stopId)) {
    return draft;
  }

  return draft.selectedStopId === stopId
    ? draft
    : {
        ...draft,
        selectedStopId: stopId
      };
}

export function useGuestRouteCurrentLocation(
  draft: GuestRouteDraft,
  label = GUEST_ROUTE_DRAFT_CURRENT_LOCATION_LABEL
): GuestRouteDraft {
  return setGuestRouteOrigin(draft, {
    label,
    useCurrentLocation: true
  });
}

export function setGuestRouteCurrentLocation(
  draft: GuestRouteDraft,
  coordinate: LatLng | null
): GuestRouteDraft {
  const currentLocation = copyValidCoordinate(coordinate);
  if (coordinatesEqual(draft.currentLocation, currentLocation)) {
    return draft;
  }

  return {
    ...draft,
    currentLocation
  };
}

export function canAddGuestRouteWaypoint(draft: GuestRouteDraft): boolean {
  return getOrderedGuestRouteDraftStops(draft).length < GUEST_ROUTE_DRAFT_MAX_STOPS;
}

export function shouldUseGuestMapSelectionAsDestination(
  draft: GuestRouteDraft
): boolean {
  return draft.destination.resolution.type !== 'coordinate';
}

export function addGuestRouteWaypoint(
  draft: GuestRouteDraft,
  options: AddGuestRouteWaypointOptions = {}
): GuestRouteDraft {
  if (!canAddGuestRouteWaypoint(draft)) {
    return draft;
  }

  const { id, nextSequence } = nextWaypointId(draft);
  const coordinate = copyValidCoordinate(options.coordinate);
  const waypoint = createStop(
    id,
    'waypoint',
    options.label ?? '',
    coordinate
      ? {
          coordinate,
          type: 'coordinate'
        }
      : unresolvedResolution()
  );
  const insertionIndex = clampInsertionIndex(options.index, draft.waypoints.length);
  const waypoints = [...draft.waypoints];
  waypoints.splice(insertionIndex, 0, waypoint);

  return {
    ...draft,
    nextWaypointSequence: nextSequence,
    selectedStopId: options.select === false ? draft.selectedStopId : waypoint.id,
    waypoints
  };
}

export function removeGuestRouteWaypoint(
  draft: GuestRouteDraft,
  waypointId: string
): GuestRouteDraft {
  const index = draft.waypoints.findIndex((waypoint) => waypoint.id === waypointId);
  if (index < 0) {
    return draft;
  }

  return {
    ...draft,
    selectedStopId: draft.selectedStopId === waypointId ? null : draft.selectedStopId,
    waypoints: draft.waypoints.filter((waypoint) => waypoint.id !== waypointId)
  };
}

export function reorderGuestRouteWaypoint(
  draft: GuestRouteDraft,
  waypointId: string,
  toIndex: number
): GuestRouteDraft {
  const fromIndex = draft.waypoints.findIndex((waypoint) => waypoint.id === waypointId);
  if (fromIndex < 0 || draft.waypoints.length < 2) {
    return draft;
  }

  const nextIndex = clampExistingIndex(toIndex, draft.waypoints.length);
  if (fromIndex === nextIndex) {
    return draft;
  }

  const waypoints = [...draft.waypoints];
  const [waypoint] = waypoints.splice(fromIndex, 1);
  waypoints.splice(nextIndex, 0, waypoint);

  return {
    ...draft,
    waypoints
  };
}

export function reorderGuestRouteStop(
  draft: GuestRouteDraft,
  stopId: string,
  toIndex: number
): GuestRouteDraft {
  const orderedStops = [...getOrderedGuestRouteDraftStops(draft)];
  const fromIndex = orderedStops.findIndex((stop) => stop.id === stopId);
  if (fromIndex < 0 || orderedStops.length < 2) {
    return draft;
  }

  const nextIndex = clampExistingIndex(toIndex, orderedStops.length);
  if (fromIndex === nextIndex) {
    return draft;
  }

  const [movedStop] = orderedStops.splice(fromIndex, 1);
  orderedStops.splice(nextIndex, 0, movedStop);

  const copyValueIntoSlot = (
    slot: GuestRouteDraftStop,
    value: GuestRouteDraftStop,
  ): GuestRouteDraftStop => ({
    ...slot,
    label: value.label,
    reorderKey: value.reorderKey,
    resolution: value.resolution,
  });

  return {
    ...draft,
    destination: copyValueIntoSlot(
      draft.destination,
      orderedStops[orderedStops.length - 1],
    ),
    origin: copyValueIntoSlot(draft.origin, orderedStops[0]),
    selectedStopId: null,
    waypoints: draft.waypoints.map((waypoint, index) =>
      copyValueIntoSlot(waypoint, orderedStops[index + 1])),
  };
}

export function resolveGuestRouteDraftStopCoordinate(
  draft: GuestRouteDraft,
  stopId: string
): LatLng | null {
  const stop = findGuestRouteDraftStop(draft, stopId);
  if (!stop) {
    return null;
  }

  if (stop.resolution.type === 'current-location') {
    return copyValidCoordinate(draft.currentLocation);
  }

  if (stop.resolution.type === 'coordinate') {
    return copyValidCoordinate(stop.resolution.coordinate);
  }

  return null;
}

export function getGuestRouteDraftUnresolvedStopIds(draft: GuestRouteDraft): string[] {
  return getOrderedGuestRouteDraftStops(draft)
    .filter(
      (stop) =>
        !hasInput(stop.label) || resolveGuestRouteDraftStopCoordinate(draft, stop.id) === null
    )
    .map((stop) => stop.id);
}

export function resolveGuestRouteDraftNextStopInputId(
  draft: GuestRouteDraft
): string {
  return getGuestRouteDraftUnresolvedStopIds(draft).find(
    (stopId) => stopId !== GUEST_ROUTE_DRAFT_ORIGIN_ID
  ) ?? draft.destination.id;
}

export function hasUnresolvedGuestRouteDraftInput(draft: GuestRouteDraft): boolean {
  return getGuestRouteDraftUnresolvedStopIds(draft).length > 0;
}

export function canExportGuestRouteDraft(draft: GuestRouteDraft): boolean {
  return !hasUnresolvedGuestRouteDraftInput(draft);
}

export function exportGuestRouteDraftCoordinates(draft: GuestRouteDraft): LatLng[] | null {
  if (!canExportGuestRouteDraft(draft)) {
    return null;
  }

  return getOrderedGuestRouteDraftStops(draft).map((stop) => {
    // The blocking check above guarantees every ordered stop resolves.
    return resolveGuestRouteDraftStopCoordinate(draft, stop.id) as LatLng;
  });
}

export function mapGuestRouteDraftToCheckpoints(
  draft: GuestRouteDraft
): RouteCheckpoint[] | null {
  const coordinates = exportGuestRouteDraftCoordinates(draft);
  if (!coordinates) {
    return null;
  }

  return getOrderedGuestRouteDraftStops(draft).map((stop, index) => ({
    caption: normalizeCaption(stop.label),
    coordinate: coordinates[index],
    id: stop.id,
    kind: stop.kind,
    label:
      stop.kind === 'origin'
        ? 'A'
        : stop.kind === 'destination'
          ? 'B'
          : String(index)
  }));
}

export function mapGuestRouteDraftToResolvedCheckpoints(
  draft: GuestRouteDraft
): RouteCheckpoint[] {
  return getOrderedGuestRouteDraftStops(draft).flatMap((stop, index) => {
    const coordinate = resolveGuestRouteDraftStopCoordinate(draft, stop.id);
    if (!coordinate || !hasInput(stop.label)) {
      return [];
    }

    return [{
      caption: normalizeCaption(stop.label),
      coordinate,
      id: stop.id,
      kind: stop.kind,
      label:
        stop.kind === 'origin'
          ? 'A'
          : stop.kind === 'destination'
            ? 'B'
            : String(index)
    }];
  });
}

export function guestRouteDraftReducer(
  draft: GuestRouteDraft,
  action: GuestRouteDraftAction
): GuestRouteDraft {
  switch (action.type) {
    case 'stop/edit':
      return editGuestRouteDraftStop(draft, action.stopId, action.label);
    case 'stop/select':
      return selectGuestRouteDraftLocation(draft, action.stopId, action.selection);
    case 'stop/set-selected':
      return setSelectedGuestRouteDraftStop(draft, action.stopId);
    case 'stop/set':
      return setGuestRouteDraftStop(draft, action.stopId, action.value);
    case 'origin/use-current-location':
      return useGuestRouteCurrentLocation(draft, action.label);
    case 'current-location/set':
      return setGuestRouteCurrentLocation(draft, action.coordinate);
    case 'waypoint/add':
      return addGuestRouteWaypoint(draft, action.options);
    case 'waypoint/remove':
      return removeGuestRouteWaypoint(draft, action.waypointId);
    case 'waypoint/reorder':
      return reorderGuestRouteWaypoint(draft, action.waypointId, action.toIndex);
    case 'stop/reorder':
      return reorderGuestRouteStop(draft, action.stopId, action.toIndex);
  }
}

function createStop(
  id: string,
  kind: GuestRouteDraftStopKind,
  label: string,
  resolution: GuestRouteDraftStopResolution
): GuestRouteDraftStop {
  return {
    id,
    kind,
    label,
    reorderKey: id,
    resolution
  };
}

function createResolution(
  kind: GuestRouteDraftStopKind,
  value: GuestRouteDraftStopValue
): GuestRouteDraftStopResolution {
  if (kind === 'origin' && value.useCurrentLocation) {
    return currentLocationResolution();
  }

  const coordinate = copyValidCoordinate(value.coordinate);
  return coordinate
    ? {
        coordinate,
        type: 'coordinate'
      }
    : unresolvedResolution();
}

function unresolvedResolution(): GuestRouteDraftStopResolution {
  return { type: 'unresolved' };
}

function currentLocationResolution(): GuestRouteDraftStopResolution {
  return { type: 'current-location' };
}

function replaceStop(
  draft: GuestRouteDraft,
  stopId: string,
  replacement: GuestRouteDraftStop
): GuestRouteDraft {
  if (stopId === draft.origin.id) {
    return {
      ...draft,
      origin: replacement
    };
  }

  if (stopId === draft.destination.id) {
    return {
      ...draft,
      destination: replacement
    };
  }

  const index = draft.waypoints.findIndex((waypoint) => waypoint.id === stopId);
  if (index < 0) {
    return draft;
  }

  const waypoints = [...draft.waypoints];
  waypoints[index] = replacement;
  return {
    ...draft,
    waypoints
  };
}

function nextWaypointId(draft: GuestRouteDraft): { id: string; nextSequence: number } {
  const usedIds = new Set(getOrderedGuestRouteDraftStops(draft).map((stop) => stop.id));
  let sequence = Number.isSafeInteger(draft.nextWaypointSequence)
    ? Math.max(1, draft.nextWaypointSequence)
    : 1;
  let id = `${GUEST_ROUTE_DRAFT_WAYPOINT_ID_PREFIX}${sequence}`;

  while (usedIds.has(id)) {
    sequence += 1;
    id = `${GUEST_ROUTE_DRAFT_WAYPOINT_ID_PREFIX}${sequence}`;
  }

  return {
    id,
    nextSequence: sequence + 1
  };
}

function clampInsertionIndex(index: number | undefined, length: number): number {
  if (!Number.isFinite(index)) {
    return length;
  }

  return Math.min(length, Math.max(0, Math.trunc(index as number)));
}

function clampExistingIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) {
    return length - 1;
  }

  return Math.min(length - 1, Math.max(0, Math.trunc(index)));
}

function hasInput(label: string): boolean {
  return label.trim().length > 0;
}

function normalizeCaption(label: string): string {
  return label.trim().replace(/\s+/g, ' ');
}

function copyValidCoordinate(coordinate: LatLng | null | undefined): LatLng | null {
  if (!isValidCoordinate(coordinate)) {
    return null;
  }

  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude
  };
}

function isValidCoordinate(coordinate: LatLng | null | undefined): coordinate is LatLng {
  return Boolean(
    coordinate &&
      Number.isFinite(coordinate.latitude) &&
      coordinate.latitude >= -90 &&
      coordinate.latitude <= 90 &&
      Number.isFinite(coordinate.longitude) &&
      coordinate.longitude >= -180 &&
      coordinate.longitude <= 180
  );
}

function coordinatesEqual(left: LatLng | null, right: LatLng | null): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.latitude === right.latitude &&
      left.longitude === right.longitude)
  );
}
