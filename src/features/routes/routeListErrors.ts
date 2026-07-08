import { getUserFacingErrorMessage } from '../api/userFacingErrors';

export type RouteListErrorAction = 'sync' | 'detail';

export interface RouteListErrorState {
  action: RouteListErrorAction;
  message: string;
  retryAccessibilityLabel: string;
  retryLabel: string;
  title: string;
}

const SYNC_FALLBACK = 'Unable to sync saved SafeRoute plans. Check your connection and retry.';
const DETAIL_FALLBACK = 'Retry before starting guidance.';
const CONNECTION_FALLBACK = 'Unable to reach LunarChain. Check your connection and retry.';

export function createRouteSyncErrorState(error: unknown): RouteListErrorState {
  return {
    action: 'sync',
    message: cleanMessage(error, SYNC_FALLBACK),
    retryAccessibilityLabel: 'Retry syncing saved SafeRoute plans',
    retryLabel: 'Retry',
    title: 'Routes unavailable'
  };
}

export function createRouteDetailErrorState(error: unknown, routeName: string): RouteListErrorState {
  const safeRouteName = cleanRouteName(routeName);
  const reason = cleanMessage(error, DETAIL_FALLBACK);

  return {
    action: 'detail',
    message: `Could not load ${safeRouteName}. ${reason}`,
    retryAccessibilityLabel: `Retry loading ${safeRouteName}`,
    retryLabel: 'Retry',
    title: 'Route unavailable'
  };
}

function cleanMessage(error: unknown, fallback: string): string {
  return getUserFacingErrorMessage(error, fallback, CONNECTION_FALLBACK);
}

function cleanRouteName(routeName: string): string {
  return routeName.trim() || 'that route';
}
