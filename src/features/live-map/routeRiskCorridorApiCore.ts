import type { LatLng } from 'react-native-maps';

import {
  fetchAreaRiskForRegion,
  type AreaRiskRegionFetchOptions
} from './areaRiskApiTransportCore';
import type { RiskZone } from './liveMapTypes';
import {
  buildRouteRiskCorridorRegions,
  loadRouteRiskCorridor
} from './routeRiskCorridorCore';
import {
  isAreaRiskFeedFailed,
  isAreaRiskFeedMissing,
  isAreaRiskFeedPending
} from './viewportRiskState';

export { buildRouteRiskCorridorRegions } from './routeRiskCorridorCore';

export async function fetchAreaRiskAlongRoute(
  coordinates: LatLng[],
  options: AreaRiskRegionFetchOptions & { maxChunks?: number } = {}
): Promise<RiskZone[]> {
  const { maxChunks, ...fetchOptions } = options;
  const requireTenantResearch = Boolean(
    String(fetchOptions.accessToken || '').trim()
    && String(fetchOptions.clientId || '').trim()
  );
  const regions = buildRouteRiskCorridorRegions(coordinates, maxChunks);
  if (!regions.length) {
    return [];
  }
  return loadRouteRiskCorridor(regions, (region) =>
    fetchAreaRiskForRegion(region, {
      ...fetchOptions,
      intent: 'read',
      detailMaxRecords: Math.min(80, fetchOptions.detailMaxRecords ?? 80),
      regionalMaxRecords: Math.min(60, fetchOptions.regionalMaxRecords ?? 60)
    }).then((feed) => {
      if (
        feed.partial
        || feed.readError
        || isAreaRiskFeedPending(feed)
        || isAreaRiskFeedFailed(feed)
        || isAreaRiskFeedMissing(feed, { requireTenantResearch })
      ) {
        throw new Error(
          'Route risk coverage is incomplete. Retry after SafeRoute research finishes.'
        );
      }
      return feed.zones;
    })
  );
}
