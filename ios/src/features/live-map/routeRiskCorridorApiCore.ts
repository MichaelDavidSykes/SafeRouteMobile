import type { LatLng } from 'react-native-maps';

import {
  AreaRiskRetryableReadError,
  fetchAreaRiskForRegion,
  getAreaRiskRetryableReadFailure,
  type AreaRiskRegionFetchOptions
} from './areaRiskApiTransportCore';
import { MAX_AREA_RISK_RECORDS } from './areaRiskApiCore';
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

export const ROUTE_RISK_MAX_UNAVAILABLE_AUTO_RETRIES = 1;
export const ROUTE_RISK_MAX_UNAVAILABLE_AUTO_RETRY_MS = 30000;

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
  let unavailableRetries = 0;
  while (true) {
    try {
      return await loadRouteRiskCorridor(regions, (region) =>
        fetchAreaRiskForRegion(region, {
          ...fetchOptions,
          intent: 'read',
          detailMaxRecords: Math.min(
            MAX_AREA_RISK_RECORDS,
            fetchOptions.detailMaxRecords ?? MAX_AREA_RISK_RECORDS
          ),
          regionalMaxRecords: Math.min(
            MAX_AREA_RISK_RECORDS,
            fetchOptions.regionalMaxRecords ?? MAX_AREA_RISK_RECORDS
          )
        }).then((feed) => {
          if (feed.retryableReadFailure) {
            throw new AreaRiskRetryableReadError(
              feed.readError || 'Route risk coverage is temporarily unavailable.',
              feed.retryableReadFailure.retryAfterSeconds
            );
          }
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
    } catch (error) {
      const retryableReadFailure = getAreaRiskRetryableReadFailure(error);
      const retryDelayMs = (retryableReadFailure?.retryAfterSeconds ?? 0) * 1000;
      if (
        !retryableReadFailure
        || unavailableRetries >= ROUTE_RISK_MAX_UNAVAILABLE_AUTO_RETRIES
        || retryDelayMs > ROUTE_RISK_MAX_UNAVAILABLE_AUTO_RETRY_MS
      ) {
        throw error;
      }
      unavailableRetries += 1;
      await waitForAreaRiskRetry(retryDelayMs, fetchOptions.signal);
    }
  }
}

function waitForAreaRiskRetry(
  delayMs: number,
  signal?: AbortSignal
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new Error('Route risk retry was cancelled.'));
  }
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', cancel);
      resolve();
    };
    const timer = setTimeout(finish, Math.max(0, delayMs));
    const cancel = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(new Error('Route risk retry was cancelled.'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
