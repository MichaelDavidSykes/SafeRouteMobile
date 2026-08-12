import type { LatLng, Region } from 'react-native-maps';

import type {
  RiskZone,
  SavedSafeRoutePlan,
} from '../live-map/liveMapTypes';

export interface GuestMapRouteLinePresentation {
  coordinates: LatLng[];
  plan: SavedSafeRoutePlan;
  revision: string;
  selected: boolean;
  strokeColor: string;
  strokeWidth: number;
  zIndex: number;
}

export interface GuestMapRouteRenderSession {
  collectionRevision: string;
  fitCoordinates: LatLng[];
  initialRegion: Region | null;
  lines: GuestMapRouteLinePresentation[];
  riskZones: RiskZone[];
  selectedCoordinates: LatLng[];
}

export function createGuestMapRouteRenderSession({
  alternativeColors,
  alternativeStrokeWidth,
  maxFitCoordinates,
  maxRenderedRiskZones,
  maxRouteCoordinates,
  routes,
  selectedColor,
  selectedRoute,
  selectedStrokeWidth,
}: {
  alternativeColors: readonly string[];
  alternativeStrokeWidth: number;
  maxFitCoordinates: number;
  maxRenderedRiskZones: number;
  maxRouteCoordinates: number;
  routes: SavedSafeRoutePlan[];
  selectedColor: string;
  selectedRoute: SavedSafeRoutePlan | null;
  selectedStrokeWidth: number;
}): GuestMapRouteRenderSession {
  if (!selectedRoute) {
    return {
      collectionRevision: '',
      fitCoordinates: [],
      initialRegion: null,
      lines: [],
      riskZones: [],
      selectedCoordinates: [],
    };
  }

  const routeCollection = collectRoutePlans(selectedRoute, routes);
  const lines = routeCollection
    .map((plan, index): GuestMapRouteLinePresentation | null => {
      const coordinates = sanitizeAndLimitCoordinates(
        plan.route.coordinates,
        maxRouteCoordinates,
      );
      if (coordinates.length < 2) {
        return null;
      }

      const selected = plan.id === selectedRoute.id;
      return {
        coordinates,
        plan,
        revision: createRouteGeometryRevision(coordinates),
        selected,
        strokeColor: selected
          ? selectedColor
          : alternativeColors[index % alternativeColors.length] || selectedColor,
        strokeWidth: selected ? selectedStrokeWidth : alternativeStrokeWidth,
        zIndex: selected ? 31 : 20 + index,
      };
    })
    .filter((line): line is GuestMapRouteLinePresentation => Boolean(line));
  const fitCoordinates = lines.flatMap((line) =>
    limitCoordinates(line.coordinates, maxFitCoordinates)
  );
  const selectedCoordinates =
    lines.find((line) => line.selected)?.coordinates || [];

  return {
    collectionRevision: lines
      .map((line) => `${line.plan.id}:${line.revision}`)
      .sort()
      .join('|'),
    fitCoordinates,
    initialRegion: regionContainingCoordinates(fitCoordinates),
    lines,
    riskZones: collectStableRiskZones([selectedRoute], maxRenderedRiskZones),
    selectedCoordinates,
  };
}

function collectRoutePlans(
  selectedRoute: SavedSafeRoutePlan,
  routes: SavedSafeRoutePlan[],
): SavedSafeRoutePlan[] {
  const collected: SavedSafeRoutePlan[] = [];
  const usedIds = new Set<string>();

  for (const route of [...routes, selectedRoute]) {
    if (usedIds.has(route.id)) {
      continue;
    }
    usedIds.add(route.id);
    collected.push(route);
    if (collected.length === 3) {
      break;
    }
  }

  return collected;
}

function sanitizeAndLimitCoordinates(
  coordinates: LatLng[],
  maxCoordinates: number,
): LatLng[] {
  const validCoordinates: LatLng[] = [];

  for (const coordinate of coordinates) {
    if (!isValidCoordinate(coordinate)) {
      continue;
    }
    const previous = validCoordinates.at(-1);
    if (
      previous &&
      previous.latitude === coordinate.latitude &&
      previous.longitude === coordinate.longitude
    ) {
      continue;
    }
    validCoordinates.push({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    });
  }

  return limitCoordinates(validCoordinates, maxCoordinates);
}

function isValidCoordinate(coordinate: LatLng | null | undefined): coordinate is LatLng {
  return Boolean(
    coordinate &&
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180,
  );
}

function limitCoordinates(
  coordinates: LatLng[],
  maxCoordinates: number,
): LatLng[] {
  if (coordinates.length <= maxCoordinates) {
    return coordinates;
  }

  const finalIndex = coordinates.length - 1;
  const sampleCount = Math.max(2, maxCoordinates);
  const limited: LatLng[] = [];
  let previousIndex = -1;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const coordinateIndex = Math.round(
      sampleIndex * finalIndex / (sampleCount - 1),
    );
    if (coordinateIndex !== previousIndex) {
      limited.push(coordinates[coordinateIndex]);
      previousIndex = coordinateIndex;
    }
  }
  return limited;
}

function createRouteGeometryRevision(coordinates: LatLng[]): string {
  let hash = 2166136261;
  for (const coordinate of coordinates) {
    hash = Math.imul(
      hash ^ Math.round(coordinate.latitude * 100_000),
      16777619,
    );
    hash = Math.imul(
      hash ^ Math.round(coordinate.longitude * 100_000),
      16777619,
    );
  }
  return `${coordinates.length}:${(hash >>> 0).toString(36)}`;
}

function regionContainingCoordinates(coordinates: LatLng[]): Region | null {
  if (!coordinates.length) {
    return null;
  }

  let north = coordinates[0].latitude;
  let south = coordinates[0].latitude;
  let east = coordinates[0].longitude;
  let west = coordinates[0].longitude;
  for (const coordinate of coordinates.slice(1)) {
    north = Math.max(north, coordinate.latitude);
    south = Math.min(south, coordinate.latitude);
    east = Math.max(east, coordinate.longitude);
    west = Math.min(west, coordinate.longitude);
  }

  return {
    latitude: (north + south) / 2,
    longitude: (east + west) / 2,
    latitudeDelta: Math.max(0.008, (north - south) * 1.35),
    longitudeDelta: Math.max(0.008, (east - west) * 1.35),
  };
}

function collectStableRiskZones(
  routes: SavedSafeRoutePlan[],
  maxRenderedRiskZones: number,
): RiskZone[] {
  const zonesById = new Map<string, RiskZone>();
  for (const route of routes) {
    for (const zone of route.riskZones) {
      if (!zonesById.has(zone.id)) {
        zonesById.set(zone.id, zone);
      }
    }
  }

  return [...zonesById.values()]
    .sort((left, right) => {
      const severityDifference =
        riskSeverityPriority(right) - riskSeverityPriority(left);
      return severityDifference || left.id.localeCompare(right.id);
    })
    .slice(0, maxRenderedRiskZones);
}

function riskSeverityPriority(zone: RiskZone): number {
  if (zone.avoidanceSeverity === 'critical') {
    return 4;
  }
  if (zone.severity === 'high') {
    return 3;
  }
  return zone.severity === 'medium' ? 2 : 1;
}
