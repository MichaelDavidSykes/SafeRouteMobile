import type { Region } from 'react-native-maps';

import { LUNARCHAIN_API_BASE } from '../../config/env';
import {
  fetchAreaRiskForRegion as fetchAreaRiskForRegionTransport,
  fetchAreaRiskViewport as fetchAreaRiskViewportTransport,
  type AreaRiskFetchOptions as AreaRiskTransportFetchOptions,
  type AreaRiskRegionFetchOptions as AreaRiskTransportRegionFetchOptions
} from './areaRiskApiTransportCore';
import type {
  AreaRiskFeed,
  AreaRiskViewportRequest
} from './areaRiskApiCore';

export type AreaRiskHttpRequester =
  import('./areaRiskApiTransportCore').AreaRiskHttpRequester;
export type AreaRiskFetchOptions = Omit<AreaRiskTransportFetchOptions, 'apiBase'>;
export type AreaRiskRegionFetchOptions =
  Omit<AreaRiskTransportRegionFetchOptions, 'apiBase'>;

export function fetchAreaRiskViewport(
  viewportRequest: AreaRiskViewportRequest,
  options: AreaRiskFetchOptions = {}
): Promise<AreaRiskFeed> {
  return fetchAreaRiskViewportTransport(viewportRequest, {
    ...options,
    apiBase: LUNARCHAIN_API_BASE
  });
}

export function fetchAreaRiskForRegion(
  region: Region,
  options: AreaRiskRegionFetchOptions = {}
): Promise<AreaRiskFeed> {
  return fetchAreaRiskForRegionTransport(region, {
    ...options,
    apiBase: LUNARCHAIN_API_BASE
  });
}
