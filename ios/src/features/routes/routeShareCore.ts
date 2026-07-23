import type { SavedSafeRoutePlan } from '../live-map/liveMapTypes';

const SAFEROUTE_WEB_ORIGIN = 'https://app.lunarchain.net';

export function buildRouteSharePath(routeId: string): string {
  const normalizedRouteId = String(routeId || '').trim();
  if (!normalizedRouteId) {
    throw new Error('A saved route is required before sharing.');
  }

  return `/convoy-routes/${encodeURIComponent(normalizedRouteId)}/share`;
}

export function normalizeRouteShareUrl(value: unknown): string {
  const sharePath = String(value || '').trim();
  if (!sharePath.startsWith('/') || sharePath.startsWith('//')) {
    throw new Error('SafeRoute did not return a valid share link.');
  }

  const shareUrl = new URL(sharePath, SAFEROUTE_WEB_ORIGIN);
  if (
    shareUrl.origin !== SAFEROUTE_WEB_ORIGIN ||
    shareUrl.protocol !== 'https:' ||
    !shareUrl.pathname.startsWith('/safe-route')
  ) {
    throw new Error('SafeRoute did not return a trusted share link.');
  }

  return shareUrl.toString();
}

export function createRouteShareMessage(
  routePlan: SavedSafeRoutePlan,
  shareUrl?: string | null,
): string {
  const routeName = routePlan.name.trim() || 'SafeRoute';
  const origin = routePlan.origin.trim() || 'route start';
  const destination = routePlan.destination.trim() || 'destination';
  const metrics = [routePlan.route.eta, routePlan.route.distance]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' · ');
  const summary = `${routeName}: ${origin} to ${destination}${metrics ? ` (${metrics})` : ''}.`;
  return shareUrl ? `${summary}\n${shareUrl}` : summary;
}
