import type { RiskSeverity, SavedRouteStatus } from '../live-map/liveMapTypes';

type RouteRiskLevel = 'low' | 'medium' | 'high';

export function normalizeStatus(status?: string): SavedRouteStatus {
  const normalizedStatus = normalizeEnumToken(status);
  if (normalizedStatus === 'ready') {
    return 'ready';
  }
  if (normalizedStatus === 'in-progress' || normalizedStatus === 'active') {
    return 'in-progress';
  }
  return 'planned';
}

export function normalizeSeverity(severity?: string): RiskSeverity {
  const normalizedSeverity = normalizeEnumToken(severity);
  if (normalizedSeverity === 'low' || normalizedSeverity === 'medium' || normalizedSeverity === 'high') {
    return normalizedSeverity;
  }
  if (normalizedSeverity === 'critical') {
    return 'high';
  }
  return 'medium';
}

export function normalizeRiskLevel(level: string | undefined, safeScore: number): RouteRiskLevel {
  const normalizedLevel = normalizeEnumToken(level);
  if (normalizedLevel === 'low' || normalizedLevel === 'medium' || normalizedLevel === 'high') {
    return normalizedLevel;
  }
  if (safeScore >= 70) {
    return 'high';
  }
  if (safeScore >= 35) {
    return 'medium';
  }
  return 'low';
}

export function normalizeRouteColor(color: string | undefined, level: RouteRiskLevel): string {
  const trimmedColor = String(color || '').trim();
  if (isSixDigitHexColor(trimmedColor)) {
    return trimmedColor;
  }
  if (level === 'high') {
    return '#f3a32b';
  }
  if (level === 'medium') {
    return '#5c8df6';
  }
  return '#15b981';
}

export function toMutedRouteColor(color: string): string {
  if (!isSixDigitHexColor(color)) {
    return 'rgba(21, 185, 129, 0.24)';
  }

  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, 0.24)`;
}

export function formatDistance(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return '0 m';
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function formatEta(etaSeconds: number | null | undefined): string {
  if (!Number.isFinite(Number(etaSeconds)) || Number(etaSeconds) <= 0) {
    return 'ETA pending';
  }

  return `${Math.max(1, Math.round(Number(etaSeconds) / 60))} min`;
}

export function formatUpdatedAt(updatedAt?: string | null): string {
  if (!updatedAt) {
    return 'Updated pending';
  }

  const updatedTime = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedTime)) {
    return 'Updated pending';
  }

  const deltaMinutes = Math.max(0, Math.round((Date.now() - updatedTime) / 60000));
  if (deltaMinutes < 1) {
    return 'Updated just now';
  }
  if (deltaMinutes < 60) {
    return `Updated ${deltaMinutes} min ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `Updated ${deltaHours} hr ago`;
  }

  return `Updated ${Math.round(deltaHours / 24)} day ago`;
}

export function normalizeEnumToken(value: string | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

export function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function clampNumber(value: number, min: number, max: number): number {
  const numericValue = toFiniteNumber(value, min);
  return Math.max(min, Math.min(max, Math.round(numericValue)));
}

export function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function toFiniteNumber(value: unknown, fallback: number): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function isSixDigitHexColor(color: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(color);
}
