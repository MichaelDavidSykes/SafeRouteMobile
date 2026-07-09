import type { LatLng } from 'react-native-maps';

import { fetchAreaRiskForRegion, type AreaRiskRegionFetchOptions } from './areaRiskApi';
import type { RiskZone } from './liveMapTypes';
import {
  buildRouteRiskCorridorRegions,
  loadRouteRiskCorridor
} from './routeRiskCorridorCore';

export { buildRouteRiskCorridorRegions } from './routeRiskCorridorCore';

export async function fetchAreaRiskAlongRoute(
  coordinates: LatLng[],
  options: AreaRiskRegionFetchOptions & { maxChunks?: number } = {}
): Promise<RiskZone[]> {
  const { maxChunks, ...fetchOptions } = options;
  const regions = buildRouteRiskCorridorRegions(coordinates, maxChunks);
  if (!regions.length) {
    return [];
  }
  return loadRouteRiskCorridor(regions, (region) =>
    fetchAreaRiskForRegion(region, {
      ...fetchOptions,
      detailMaxRecords: Math.min(80, fetchOptions.detailMaxRecords ?? 80),
      regionalMaxRecords: Math.min(60, fetchOptions.regionalMaxRecords ?? 60)
    }).then((feed) => feed.zones)
  );
}
