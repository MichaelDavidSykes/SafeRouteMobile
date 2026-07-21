export type AppTab = 'map' | 'routes' | 'convoys' | 'calendar';

export function isAppTabDisabled(
  tab: AppTab,
  authenticated: boolean,
): boolean {
  return tab !== 'map' && !authenticated;
}
