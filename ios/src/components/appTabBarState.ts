export type AppTab = 'map' | 'routes' | 'convoys' | 'calendar';

export type AppTabBarLayout = {
  bottomInset: number;
  height: number;
};

const APP_TAB_BAR_TOP_INSET = 8;
const APP_TAB_BAR_ITEM_HEIGHT = 52;
const APP_TAB_BAR_MIN_BOTTOM_INSET = 26;

export function resolveAppTabBarLayout(
  safeAreaBottom: number,
): AppTabBarLayout {
  const normalizedSafeArea = Number.isFinite(safeAreaBottom)
    ? Math.max(0, safeAreaBottom)
    : 0;
  const bottomInset = Math.max(
    APP_TAB_BAR_MIN_BOTTOM_INSET,
    normalizedSafeArea,
  );

  return {
    bottomInset,
    height: APP_TAB_BAR_TOP_INSET + APP_TAB_BAR_ITEM_HEIGHT + bottomInset,
  };
}

export function isAppTabDisabled(
  tab: AppTab,
  authenticated: boolean,
): boolean {
  return tab !== 'map' && !authenticated;
}
