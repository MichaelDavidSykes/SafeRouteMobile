import { getUserFacingErrorMessage } from '../api/userFacingErrors';

export type RouteListErrorAction = 'sync' | 'detail';

export interface RouteListErrorState {
  action: RouteListErrorAction;
  message: string;
  messageAccessibilityLabel: string;
  retryAccessibilityLabel: string;
  retryLabel: string;
  title: string;
}

const SYNC_FALLBACK = 'Unable to sync saved SafeRoute plans. Check your connection and retry.';
const DETAIL_FALLBACK = 'Retry before starting guidance.';
const CONNECTION_FALLBACK = 'Unable to reach LunarChain. Check your connection and retry.';
export const ROUTE_DETAIL_ERROR_ROUTE_NAME_MAX_LENGTH = 56;
export const ROUTE_LIST_ERROR_REASON_MAX_LENGTH = 72;
export const ROUTE_SYNC_ERROR_MESSAGE_MAX_LENGTH = 96;

export function createRouteSyncErrorState(error: unknown): RouteListErrorState {
  const message = cleanMessage(error, SYNC_FALLBACK);

  return {
    action: 'sync',
    message: createCompactRouteErrorText(message, ROUTE_SYNC_ERROR_MESSAGE_MAX_LENGTH),
    messageAccessibilityLabel: message,
    retryAccessibilityLabel: 'Retry syncing saved SafeRoute plans',
    retryLabel: 'Retry',
    title: 'Routes unavailable'
  };
}

export function createRouteDetailErrorState(error: unknown, routeName: string): RouteListErrorState {
  const safeRouteName = cleanRouteName(routeName);
  const compactRouteName = createCompactRouteErrorName(safeRouteName);
  const reason = cleanMessage(error, DETAIL_FALLBACK);
  const compactReason = createCompactRouteErrorText(reason, ROUTE_LIST_ERROR_REASON_MAX_LENGTH);

  return {
    action: 'detail',
    message: createRouteDetailErrorMessage(compactRouteName, compactReason),
    messageAccessibilityLabel: createRouteDetailErrorMessage(safeRouteName, reason),
    retryAccessibilityLabel: `Retry loading ${safeRouteName}`,
    retryLabel: 'Retry',
    title: 'Route unavailable'
  };
}

function cleanMessage(error: unknown, fallback: string): string {
  return normalizeRouteErrorText(
    getUserFacingErrorMessage(error, fallback, CONNECTION_FALLBACK)
  ) || fallback;
}

function cleanRouteName(routeName: string): string {
  return normalizeRouteErrorText(routeName) || 'that route';
}

function normalizeRouteErrorText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function createRouteDetailErrorMessage(routeName: string, reason: string): string {
  return createRouteErrorSentences([`Could not load ${routeName}`, reason]);
}

function createRouteErrorSentences(parts: string[]): string {
  return parts
    .map(normalizeRouteErrorText)
    .filter(Boolean)
    .map(createRouteErrorSentence)
    .join(' ');
}

function createRouteErrorSentence(part: string): string {
  return hasTerminalRouteErrorPunctuation(part) ? part : `${part}.`;
}

function hasTerminalRouteErrorPunctuation(part: string): boolean {
  return /[.!?…]$/.test(part.trim());
}

function createCompactRouteErrorName(routeName: string): string {
  if (routeName === 'that route' || routeName.length <= ROUTE_DETAIL_ERROR_ROUTE_NAME_MAX_LENGTH) {
    return routeName;
  }

  return `${routeName.slice(0, ROUTE_DETAIL_ERROR_ROUTE_NAME_MAX_LENGTH - 1).trimEnd()}…`;
}

function createCompactRouteErrorText(message: string, maxLength: number): string {
  const normalizedMessage = normalizeRouteErrorText(message);

  if (normalizedMessage.length <= maxLength) {
    return normalizedMessage;
  }

  return `${normalizedMessage.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
