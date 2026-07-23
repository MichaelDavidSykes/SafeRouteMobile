import { apiRequest } from '../api/apiClient';
import {
  buildRouteSharePath,
  normalizeRouteShareUrl,
} from './routeShareCore';

export {
  buildRouteSharePath,
  createRouteShareMessage,
  normalizeRouteShareUrl,
} from './routeShareCore';

type RouteShareResponse = {
  share_path?: unknown;
};

export async function prepareSavedRouteShare(
  accessToken: string,
  routeId: string,
): Promise<string> {
  const normalizedAccessToken = String(accessToken || '').trim();
  if (!normalizedAccessToken) {
    throw new Error('Sign in again before sharing this saved route.');
  }

  const response = await apiRequest<RouteShareResponse>(
    buildRouteSharePath(routeId),
    normalizedAccessToken,
    { method: 'POST' },
  );
  return normalizeRouteShareUrl(response.share_path);
}
