export type AppTab = 'map' | 'routes' | 'convoys' | 'calendar';

const APP_NAVIGATION_MENU_EDGE_INSET = 14;
const APP_NAVIGATION_MENU_SAFE_AREA_GAP = 12;

export function resolveAppNavigationMenuBottomInset(
  safeAreaBottom: number,
): number {
  const normalizedSafeArea = Number.isFinite(safeAreaBottom)
    ? Math.max(0, safeAreaBottom)
    : 0;

  return Math.max(
    APP_NAVIGATION_MENU_EDGE_INSET,
    normalizedSafeArea + APP_NAVIGATION_MENU_SAFE_AREA_GAP,
  );
}

export function isAppTabDisabled(
  tab: AppTab,
  authenticated: boolean,
): boolean {
  return tab !== 'map' && !authenticated;
}
