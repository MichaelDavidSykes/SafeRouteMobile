import type { PermissionStatus as LiveLocationPermissionStatus } from './liveLocationState';

export type NavigationLifecycle = 'loaded' | 'navigating' | 'paused' | 'off-route' | 'arrived' | 'stopped';

export type RouteStatusTone = 'demo' | 'live' | 'danger';

export const DEFAULT_ROUTE_INTELLIGENCE_VISIBLE = false;

export interface RouteStatusPillPresentation {
  accessibilityLabel: string;
  label: string;
  tone: RouteStatusTone;
}

export interface RouteHeaderPresentation {
  compactNavigation: boolean;
  minimalActiveNavigation: boolean;
  showInlineEndpoints: boolean;
  showRouteEndpoints: boolean;
  showRouteSubtitle: boolean;
  showRouteTitle: boolean;
}

export interface LiveLocationNoticePresentation {
  accessibilityLabel: string;
  displayText: string;
}

export interface RouteEndpointLinePresentation {
  accessibilityLabel: string;
  displayText: string;
}

interface RouteStatusPillOptions {
  state: NavigationLifecycle;
  trackingLabel: string;
}

interface RouteHeaderPresentationOptions {
  state: NavigationLifecycle;
  showRouteEndpoints: boolean;
  showRouteSubtitle: boolean;
}
export type LiveMapControlId = 'center' | 'fit' | 'follow' | 'intelligence' | 'reroute';

interface LocationReadinessOptions {
  demoDriveActive: boolean;
  hasLiveCoordinate: boolean;
  permissionStatus: LiveLocationPermissionStatus;
  routeCoordinateCount?: number;
}

interface LocationNoticeOptions extends LocationReadinessOptions {
  demoDriveAvailable: boolean;
  errorMessage?: string | null;
}

interface MapControlAccessibilityOptions {
  active?: boolean;
  disabled?: boolean;
  driveAlongActive?: boolean;
  hasLiveLocation?: boolean;
}

interface ControlAccessibilityCopy {
  hint: string;
  label: string;
  state: {
    disabled?: boolean;
    selected?: boolean;
  };
}

export function mapControlDisplayLabel(
  control: LiveMapControlId,
  options: MapControlAccessibilityOptions = {}
): string {
  const driveAlongActive = Boolean(options.driveAlongActive);
  const hasLiveLocation = Boolean(options.hasLiveLocation);

  switch (control) {
    case 'center':
      return driveAlongActive || hasLiveLocation ? 'Me' : 'Start';
    case 'fit':
      return 'Route';
    case 'follow':
      return driveAlongActive ? 'Drive' : 'Follow';
    case 'intelligence':
      return 'Risk';
    case 'reroute':
      return 'Reroute';
  }
}

export function routeStartBlockedReason({
  demoDriveActive,
  hasLiveCoordinate,
  permissionStatus,
  routeCoordinateCount
}: LocationReadinessOptions): string | null {
  const geometryBlockedReason = routeGeometryBlockedReason(routeCoordinateCount);
  if (geometryBlockedReason) {
    return geometryBlockedReason;
  }

  if (demoDriveActive) {
    return null;
  }

  if (permissionStatus === 'denied') {
    return 'Turn on foreground location access to start live guidance.';
  }

  if (permissionStatus === 'checking') {
    return 'Checking foreground location access before live guidance can start.';
  }

  if (!hasLiveCoordinate) {
    return 'Waiting for a live location fix before guidance can start.';
  }

  return null;
}

export function liveLocationNotice({
  demoDriveActive,
  demoDriveAvailable,
  errorMessage,
  hasLiveCoordinate,
  permissionStatus,
  routeCoordinateCount
}: LocationNoticeOptions): string | null {
  const geometryBlockedReason = routeGeometryBlockedReason(routeCoordinateCount);
  if (geometryBlockedReason) {
    return geometryBlockedReason;
  }

  if (demoDriveActive) {
    return null;
  }

  const trimmedMessage = errorMessage?.trim();
  if (trimmedMessage) {
    return trimmedMessage;
  }

  if (permissionStatus === 'denied') {
    return demoDriveAvailable
      ? 'Location access is off. Enable it in iOS Settings for live guidance, or use route simulation for review.'
      : 'Location access is off. Enable it in iOS Settings for live route guidance.';
  }

  return routeStartBlockedReason({ demoDriveActive, hasLiveCoordinate, permissionStatus, routeCoordinateCount });
}

export function createLiveLocationNoticePresentation(
  notice: string | null
): LiveLocationNoticePresentation | null {
  const trimmedNotice = notice?.trim().replace(/\s+/g, ' ');
  if (!trimmedNotice) {
    return null;
  }

  return {
    accessibilityLabel: `Location status. ${trimmedNotice}`,
    displayText: liveLocationNoticeDisplayText(trimmedNotice)
  };
}

function liveLocationNoticeDisplayText(notice: string): string {
  const normalized = notice.toLowerCase();

  if (normalized.includes('geometry') || normalized.includes('re-sync')) {
    return 'Re-sync route';
  }

  if (normalized.includes('checking')) {
    return 'Checking location';
  }

  if (normalized.includes('waiting') || normalized.includes('location fix')) {
    return 'Location needed';
  }

  if (
    normalized.includes('access is off') ||
    normalized.includes('permission is off') ||
    normalized.includes('foreground location access') ||
    normalized.includes('ios settings')
  ) {
    return 'Location access off';
  }

  if (normalized.includes('unavailable')) {
    return 'Location unavailable';
  }

  return 'Location unavailable';
}

function routeGeometryBlockedReason(routeCoordinateCount?: number): string | null {
  if (typeof routeCoordinateCount !== 'number' || !Number.isFinite(routeCoordinateCount)) {
    return null;
  }

  return routeCoordinateCount >= 2
    ? null
    : 'Saved route geometry is incomplete. Re-sync the route before live guidance.';
}

export function createRouteEndpointLinePresentation({
  destination,
  origin
}: {
  destination: string;
  origin: string;
}): RouteEndpointLinePresentation {
  const originLabel = normalizeRouteEndpointLabel(origin, 'Route start');
  const destinationLabel = normalizeRouteEndpointLabel(destination, 'Destination');

  return {
    accessibilityLabel: `Route from ${originLabel} to ${destinationLabel}.`,
    displayText: `${originLabel} → ${destinationLabel}`
  };
}

export function createRouteTitleAccessibilityLabel({
  convoyCallsign,
  name,
  operation
}: {
  convoyCallsign: string;
  name: string;
  operation: string;
}): string {
  const routeName = normalizeRouteEndpointLabel(name, 'Saved route');
  const operationLabel = operation.trim().replace(/\s+/g, ' ');
  const convoyLabel = convoyCallsign.trim().replace(/\s+/g, ' ');
  const details = [
    operationLabel ? `Operation ${operationLabel}.` : null,
    convoyLabel ? `Convoy ${convoyLabel}.` : null
  ].filter(Boolean);

  return [`Route ${routeName}.`, ...details].join(' ');
}

function normalizeRouteEndpointLabel(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed || fallback;
}

export function mapControlAccessibility(
  control: LiveMapControlId,
  options: MapControlAccessibilityOptions = {}
): ControlAccessibilityCopy {
  const active = Boolean(options.active);
  const disabled = Boolean(options.disabled);
  const driveAlongActive = Boolean(options.driveAlongActive);
  const hasLiveLocation = Boolean(options.hasLiveLocation);

  switch (control) {
    case 'center':
      if (driveAlongActive && hasLiveLocation) {
        return {
          label: 'Re-center drive-along view',
          hint: 'Returns to the route-facing navigation camera.',
          state: { disabled }
        };
      }

      return {
        label: hasLiveLocation ? 'Center map on convoy' : 'Center map on route start',
        hint: hasLiveLocation ? 'Moves the map to the current convoy position.' : 'Moves the map to the saved route start until live location is available.',
        state: { disabled }
      };
    case 'fit':
      return {
        label: 'Show full route',
        hint: 'Zooms the map to show the saved route.',
        state: { disabled }
      };
    case 'follow':
      if (disabled && !driveAlongActive) {
        return {
          label: 'Drive-along starts with guidance',
          hint: 'Start route guidance before changing the drive-along camera.',
          state: { disabled: true, selected: false }
        };
      }

      if (driveAlongActive) {
        return {
          label: active ? 'Turn drive-along view off' : 'Turn drive-along view on',
          hint: active
            ? 'Stops the map from following the route-facing navigation view.'
            : 'Follows the convoy from a route-facing navigation view.',
          state: { disabled, selected: active }
        };
      }

      return {
        label: active ? 'Turn follow mode off' : 'Turn follow mode on',
        hint: active ? 'Stops the map from following convoy movement.' : 'Keeps the map centered while navigating.',
        state: { disabled, selected: active }
      };
    case 'intelligence':
      return {
        label: active ? 'Hide route risk notes' : 'Show route risk notes',
        hint: active ? 'Hides risk overlays from the map.' : 'Shows risk overlays on the map.',
        state: { disabled, selected: active }
      };
    case 'reroute':
      return {
        label: 'Reroute unavailable',
        hint: 'Dynamic rerouting is not available in this version yet.',
        state: { disabled: true }
      };
  }
}

export function primaryRouteActionAccessibility(
  state: NavigationLifecycle,
  disabledReason?: string | null
): ControlAccessibilityCopy {
  if (disabledReason) {
    return {
      label: `Start route. ${disabledReason}`,
      hint: disabledReason,
      state: { disabled: true }
    };
  }

  if (state === 'arrived') {
    return {
      label: 'Route complete',
      hint: 'The convoy is already at the destination.',
      state: { disabled: true }
    };
  }

  if (state === 'navigating' || state === 'off-route') {
    return {
      label: 'Pause route guidance',
      hint: 'Pauses live route guidance for this saved route.',
      state: { disabled: false }
    };
  }

  if (state === 'paused') {
    return {
      label: 'Resume route guidance',
      hint: 'Resumes live route guidance for this saved route.',
      state: { disabled: false }
    };
  }

  return {
    label: 'Start route guidance',
    hint: 'Starts live route guidance for this saved route.',
    state: { disabled: false }
  };
}

export function stopRouteAccessibility(state: NavigationLifecycle): ControlAccessibilityCopy {
  return {
    label: state === 'stopped' ? 'Route guidance stopped' : 'Stop route guidance',
    hint: 'Stops guidance and resets progress for this route.',
    state: { selected: state === 'stopped' }
  };
}

export function demoDriveAccessibility(enabled: boolean): ControlAccessibilityCopy {
  return {
    label: enabled ? 'Turn route simulation off' : 'Turn route simulation on',
    hint: enabled ? 'Returns to live GPS tracking when available.' : 'Simulates convoy movement for local route review.',
    state: { selected: enabled }
  };
}

export function shouldShowGuidanceCard(state: NavigationLifecycle): boolean {
  return state !== 'loaded' && state !== 'stopped' && state !== 'arrived';
}

export function shouldShowDriveAlongControl(state: NavigationLifecycle): boolean {
  return state === 'navigating' || state === 'off-route';
}

export function shouldShowRouteIntelligenceControl(
  routeIntelCount: number
): boolean {
  return Number.isFinite(routeIntelCount) && routeIntelCount > 0;
}

export function shouldUseCompactRouteHeader(state: NavigationLifecycle): boolean {
  return state === 'navigating' || state === 'off-route' || state === 'paused';
}

export function shouldUseMinimalActiveRouteHeader(state: NavigationLifecycle): boolean {
  return state === 'navigating' || state === 'off-route';
}

export function createRouteHeaderPresentation({
  state,
  showRouteEndpoints
}: RouteHeaderPresentationOptions): RouteHeaderPresentation {
  const compactNavigation = shouldUseCompactRouteHeader(state);
  const minimalActiveNavigation = shouldUseMinimalActiveRouteHeader(state);

  return {
    compactNavigation,
    minimalActiveNavigation,
    showInlineEndpoints: !compactNavigation && !showRouteEndpoints,
    showRouteEndpoints: !compactNavigation && showRouteEndpoints,
    showRouteSubtitle: false,
    showRouteTitle: !minimalActiveNavigation
  };
}

export function routeStatusPillPresentation({
  state,
  trackingLabel
}: RouteStatusPillOptions): RouteStatusPillPresentation {
  const label = routeStatusLabel(state, trackingLabel);

  return {
    accessibilityLabel: `Route status: ${label}.`,
    label,
    tone: routeStatusTone(state)
  };
}

function routeStatusLabel(state: NavigationLifecycle, trackingLabel: string): string {
  if (state === 'navigating') {
    return trackingLabel.trim() || 'Live guidance';
  }

  if (state === 'off-route') {
    return 'Off route';
  }

  if (state === 'arrived') {
    return 'Arrived';
  }

  if (state === 'paused') {
    return 'Paused';
  }

  if (state === 'stopped') {
    return 'Stopped';
  }

  return 'Ready';
}

function routeStatusTone(state: NavigationLifecycle): RouteStatusTone {
  if (state === 'off-route') {
    return 'danger';
  }

  if (state === 'navigating' || state === 'arrived') {
    return 'live';
  }

  return 'demo';
}
