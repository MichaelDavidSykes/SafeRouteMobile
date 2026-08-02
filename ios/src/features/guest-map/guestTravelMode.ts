import type { SafeRouteTravelMode } from '../live-map/liveMapTypes';

export type GuestTravelModeOption = {
  accessibilityLabel: string;
  id: SafeRouteTravelMode;
  label: string;
  routeLabel: string;
};

export const GUEST_TRAVEL_MODE_OPTIONS: readonly GuestTravelModeOption[] = [
  {
    accessibilityLabel: 'Plot driving route',
    id: 'drive',
    label: 'Drive',
    routeLabel: 'driving',
  },
  {
    accessibilityLabel: 'Plot walking route',
    id: 'walk',
    label: 'Walk',
    routeLabel: 'walking',
  },
  {
    accessibilityLabel: 'Plot cycling route',
    id: 'cycle',
    label: 'Cycle',
    routeLabel: 'cycling',
  },
];

export function getGuestTravelModeRouteLabel(
  mode: SafeRouteTravelMode,
): string {
  return GUEST_TRAVEL_MODE_OPTIONS.find((option) => option.id === mode)
    ?.routeLabel || 'selected';
}

export function normalizeSafeRouteTravelMode(
  value: unknown,
): SafeRouteTravelMode {
  return value === 'walk' || value === 'cycle'
    ? value
    : 'drive';
}
