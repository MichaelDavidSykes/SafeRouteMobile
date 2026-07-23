import type { SafeRouteTravelMode } from '../live-map/liveMapTypes';

export type GuestTravelModeOption = {
  accessibilityLabel: string;
  id: SafeRouteTravelMode;
  label: string;
};

export const GUEST_TRAVEL_MODE_OPTIONS: readonly GuestTravelModeOption[] = [
  {
    accessibilityLabel: 'Drive route',
    id: 'drive',
    label: 'Drive',
  },
  {
    accessibilityLabel: 'Walking route',
    id: 'walk',
    label: 'Walk',
  },
  {
    accessibilityLabel: 'Cycling route',
    id: 'cycle',
    label: 'Cycle',
  },
  {
    accessibilityLabel: 'Public transport route',
    id: 'transit',
    label: 'Transit',
  },
];

export function normalizeSafeRouteTravelMode(
  value: unknown,
): SafeRouteTravelMode {
  return value === 'walk' || value === 'cycle' || value === 'transit'
    ? value
    : 'drive';
}
