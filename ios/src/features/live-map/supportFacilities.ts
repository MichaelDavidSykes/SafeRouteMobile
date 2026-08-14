import type { SupportFacility, SupportFacilityKind } from './liveMapTypes';

export const MAX_MOBILE_SUPPORT_FACILITIES = 48;

export function normalizeMobileSupportFacilities(value: unknown): SupportFacility[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const facilities: SupportFacility[] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < value.length && facilities.length < MAX_MOBILE_SUPPORT_FACILITIES; index += 1) {
    const item = value[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const kind = normalizeSupportFacilityKind(record.kind);
    const coordinateRecord = record.coordinate && typeof record.coordinate === 'object'
      ? record.coordinate as Record<string, unknown>
      : record;
    const latitude = finiteNumber(coordinateRecord.latitude ?? coordinateRecord.lat);
    const longitude = finiteNumber(
      coordinateRecord.longitude ?? coordinateRecord.lon ?? coordinateRecord.lng,
    );
    if (
      !kind ||
      latitude === null ||
      longitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      continue;
    }
    const id = cleanText(record.id, `support-${index + 1}`, 100);
    if (seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    const supportType = optionalText(record.support_type ?? record.supportType, 80);
    const source = optionalText(record.source, 160);
    const details = optionalText(record.details, 500);
    const distanceMeters = nonNegativeNumber(record.distance_m ?? record.distanceMeters);
    const routeDistanceKm = nonNegativeNumber(
      record.route_distance_km ?? record.routeDistanceKm,
    );
    facilities.push({
      id,
      label: cleanText(record.label, defaultSupportFacilityLabel(kind), 140),
      kind,
      coordinate: { latitude, longitude },
      ...(supportType ? { supportType } : {}),
      ...(source ? { source } : {}),
      ...(details ? { details } : {}),
      ...(distanceMeters !== null ? { distanceMeters } : {}),
      ...(routeDistanceKm !== null ? { routeDistanceKm } : {}),
    });
  }
  return facilities;
}

export function supportFacilityCalloutDescription(facility: SupportFacility): string {
  const parts = [
    supportFacilityKindLabel(facility),
    typeof facility.distanceMeters === 'number'
      ? `${formatSupportDistance(facility.distanceMeters)} from route`
      : null,
    facility.details,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' · ');
}

export function supportFacilityKindLabel(facility: SupportFacility): string {
  if (facility.kind === 'police') {
    return 'Police station';
  }
  if (facility.kind === 'hospital' || facility.supportType === 'hospital') {
    return 'Hospital';
  }
  return 'Safe haven';
}

function normalizeSupportFacilityKind(value: unknown): SupportFacilityKind | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace('_', '-');
  return normalized === 'hospital' || normalized === 'police' || normalized === 'safe-haven'
    ? normalized
    : null;
}

function defaultSupportFacilityLabel(kind: SupportFacilityKind): string {
  return kind === 'hospital'
    ? 'Hospital'
    : kind === 'police'
      ? 'Police station'
      : 'Safe haven';
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return (text || fallback).slice(0, maxLength);
}

function optionalText(value: unknown, maxLength: number): string | undefined {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, maxLength) : undefined;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function formatSupportDistance(distanceMeters: number): string {
  return distanceMeters < 1000
    ? `${Math.round(distanceMeters)} m`
    : `${(distanceMeters / 1000).toFixed(1)} km`;
}
