import { apiRequest } from '../api/apiClient';
import {
  SAFEROUTE_PREVIEW_INITIAL_SCREEN,
  SAFEROUTE_PREVIEW_MODE_ENABLED,
} from '../../config/env';
import { isPreviewAccessToken } from '../auth/previewSession';
import { loadRouteDetail, loadSavedRoutes, type SavedRouteSyncResult } from './routeApiCore';
import type { SavedSafeRoutePlan } from '../live-map/liveMapTypes';
import { loadPreviewRouteDetail, loadPreviewSavedRoutes } from './previewRouteApi';

export async function fetchSavedRoutes(accessToken: string, clientId?: string): Promise<SavedRouteSyncResult> {
  if (SAFEROUTE_PREVIEW_MODE_ENABLED && isPreviewAccessToken(accessToken)) {
    return loadPreviewSavedRoutes(clientId, {
      empty: SAFEROUTE_PREVIEW_INITIAL_SCREEN === 'routes-empty',
      noPreference: SAFEROUTE_PREVIEW_INITIAL_SCREEN === 'workspace-choice',
    });
  }

  return loadSavedRoutes(apiRequest, accessToken, clientId);
}

export async function fetchRouteDetail(accessToken: string, routeId: string): Promise<SavedSafeRoutePlan> {
  if (SAFEROUTE_PREVIEW_MODE_ENABLED && isPreviewAccessToken(accessToken)) {
    return loadPreviewRouteDetail(routeId);
  }

  return loadRouteDetail(apiRequest, accessToken, routeId);
}
