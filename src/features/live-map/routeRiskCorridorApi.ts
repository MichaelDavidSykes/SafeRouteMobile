import type { LatLng } from 'react-native-maps';

import { LUNARCHAIN_API_BASE } from '../../config/env';
import {
  fetchAreaRiskAlongRoute as fetchAreaRiskAlongRouteTransport
} from './routeRiskCorridorApiCore';
import type { AreaRiskRegionFetchOptions } from './areaRiskApi';
import type { RiskZone } from './liveMapTypes';

export { buildRouteRiskCorridorRegions } from './routeRiskCorridorCore';

export function fetchAreaRiskAlongRoute(
  coordinates: LatLng[],
  options: AreaRiskRegionFetchOptions & { maxChunks?: number } = {}
): Promise<RiskZone[]> {
  return fetchAreaRiskAlongRouteTransport(coordinates, {
    ...options,
    apiBase: LUNARCHAIN_API_BASE
  });
}
