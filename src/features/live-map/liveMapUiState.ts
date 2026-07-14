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

export const LIVE_ROUTE_TITLE_MAX_LENGTH = 64;
export const LIVE_ROUTE_ENDPOINT_LABEL_MAX_LENGTH = 36;
export const LIVE_ROUTE_STATUS_LABEL_MAX_LENGTH = 18;

const TERMINAL_SENTENCE_PUNCTUATION_PATTERN = /[.!?…]$/;

interface RouteStatusPillOptions {
  state: NavigationLifecycle;
  trackingLabel: string;
}

interface RouteHeaderPresentationOptions {
  state: NavigationLifecycle;
  showRouteEndpoints: boolean;
  showRouteSubtitle: boolean;
}
export type LiveMapControlId = 'center' | 'fit' | 'intelligence';

interface LocationReadinessOptions {
  demoDriveActive: boolean;
  hasLiveCoordinate: boolean;
  permissionStatus: LiveLocationPermissionStatus;
  routeCoordinateCount?: number;
}

interface LocationNoticeOptions extends LocationReadinessOptions {
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

export function mapControlDisplayLabel(control: LiveMapControlId): string {
  switch (control) {
    case 'center':
      return 'Center';
    case 'fit':
      return 'Overview';
    case 'intelligence':
      return 'Risks';
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

  if (permissionStatus === 'idle') {
    return null;
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
    return 'Location access is off. Enable it in iOS Settings for live route guidance.';
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
  const workspaceAccessNotice = isWorkspaceAccessNotice(trimmedNotice);

  return {
    accessibilityLabel: `${workspaceAccessNotice ? 'Access' : 'Location'} status. ${createLiveMapAccessibilitySentence(trimmedNotice)}`,
    displayText: liveLocationNoticeDisplayText(trimmedNotice)
  };
}

function liveLocationNoticeDisplayText(notice: string): string {
  const normalized = notice.toLowerCase();

  if (isWorkspaceAccessNotice(normalized)) {
    if (normalized.includes('checking')) {
      return 'Checking access';
    }
    if (normalized.includes('reconnect') || normalized.includes('verified')) {
      return 'Retry access';
    }
    return 'Access unavailable';
  }

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

function isWorkspaceAccessNotice(notice: string): boolean {
  const normalized = notice.toLowerCase();
  return (
    normalized.includes('workspace access') ||
    normalized.includes('access could not be verified')
  );
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
    accessibilityLabel: createLiveMapAccessibilitySentence(`Route from ${originLabel} to ${destinationLabel}`),
    displayText: `${createCompactLiveRouteLabel(
      originLabel,
      LIVE_ROUTE_ENDPOINT_LABEL_MAX_LENGTH
    )} → ${createCompactLiveRouteLabel(
      destinationLabel,
      LIVE_ROUTE_ENDPOINT_LABEL_MAX_LENGTH
    )}`
  };
}

export function createRouteTitleDisplayText(name: string): string {
  return createCompactLiveRouteLabel(
    normalizeRouteEndpointLabel(name, 'Saved route'),
    LIVE_ROUTE_TITLE_MAX_LENGTH
  );
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
    operationLabel ? createLiveMapAccessibilitySentence(`Operation ${operationLabel}`) : null,
    convoyLabel && convoyLabel !== operationLabel
      ? createLiveMapAccessibilitySentence(createConvoyAccessibilityLabel(convoyLabel))
      : null
  ].filter(Boolean);

  return [createLiveMapAccessibilitySentence(`Route ${routeName}`), ...details].join(' ');
}

function createConvoyAccessibilityLabel(convoyLabel: string): string {
  return /^convoy\b/i.test(convoyLabel.trim())
    ? convoyLabel
    : `Convoy ${convoyLabel}`;
}

function createLiveMapAccessibilitySentence(label: string): string {
  const normalizedLabel = label.trim().replace(/\s+/g, ' ');

  return `${normalizedLabel}${TERMINAL_SENTENCE_PUNCTUATION_PATTERN.test(normalizedLabel) ? '' : '.'}`;
}

function normalizeRouteEndpointLabel(value: string, fallback: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed || fallback;
}

function createCompactLiveRouteLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
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
      if (driveAlongActive) {
        return {
          label: 'Show full route',
          hint: 'Shows the full route and pauses drive-along follow for map review.',
          state: { disabled }
        };
      }

      return {
        label: 'Show full route',
        hint: 'Zooms the map to show the saved route.',
        state: { disabled }
      };
    case 'intelligence':
      return {
        label: active ? 'Hide route risk notes' : 'Show route risk notes',
        hint: active ? 'Hides risk overlays from the map.' : 'Shows risk overlays on the map.',
        state: { disabled, selected: active }
      };
  }
}

export function primaryRouteActionAccessibility(
  state: NavigationLifecycle,
  disabledReason?: string | null
): ControlAccessibilityCopy {
  const normalizedDisabledReason = normalizeRouteActionDisabledReason(disabledReason);
  if (normalizedDisabledReason) {
    return {
      label: `Start route. ${normalizedDisabledReason}`,
      hint: normalizedDisabledReason,
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

export function shouldShowNativeUserLocation({
  demoDriveActive,
  permissionStatus,
  state
}: {
  demoDriveActive: boolean;
  permissionStatus: LiveLocationPermissionStatus;
  state: NavigationLifecycle;
}): boolean {
  return Boolean(
    permissionStatus === 'granted' &&
      !demoDriveActive &&
      state !== 'navigating' &&
      state !== 'off-route'
  );
}

export function resolveVisibleMapControls({
  routeIntelCount,
  state
}: {
  routeIntelCount: number;
  state: NavigationLifecycle;
}): LiveMapControlId[] {
  if (shouldShowDriveAlongControl(state)) {
    return ['fit', 'center'];
  }

  return [
    'center',
    'fit',
    ...(shouldShowRouteIntelligenceControl(routeIntelCount)
      ? (['intelligence'] as LiveMapControlId[])
      : [])
  ];
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
  const accessibilityLabel = routeStatusAccessibilityLabel(state, trackingLabel);

  return {
    accessibilityLabel: createRouteStatusSentence(accessibilityLabel),
    label,
    tone: routeStatusTone(state)
  };
}

function routeStatusLabel(state: NavigationLifecycle, trackingLabel: string): string {
  if (state === 'navigating') {
    return createCompactLiveRouteLabel(
      normalizeRouteStatusLabel(trackingLabel, 'Live guidance'),
      LIVE_ROUTE_STATUS_LABEL_MAX_LENGTH
    );
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

function routeStatusAccessibilityLabel(state: NavigationLifecycle, trackingLabel: string): string {
  if (state === 'navigating') {
    return normalizeRouteStatusLabel(trackingLabel, 'Live guidance');
  }

  return routeStatusLabel(state, trackingLabel);
}

function normalizeRouteStatusLabel(value: string, fallback: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || fallback;
}

function createRouteStatusSentence(label: string): string {
  return `Route status: ${label}${TERMINAL_SENTENCE_PUNCTUATION_PATTERN.test(label) ? '' : '.'}`;
}

function normalizeRouteActionDisabledReason(reason?: string | null): string | null {
  const normalizedReason = reason?.trim().replace(/\s+/g, ' ');
  if (!normalizedReason) {
    return null;
  }

  return createLiveMapAccessibilitySentence(normalizedReason);
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
