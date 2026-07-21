export const SAFE_ROUTE_RISK_SAFETY_FILTER_CAPABILITY = 'safe-route-risk-rejection-v1';

export interface AreaRiskSafetyFilterAuthority {
  present: boolean;
  valid: boolean;
  rejectedCount: number;
  localityRejectedCount: number;
  cityScaleRejectedCount: number;
  invalidRecordRejectedCount: number;
  outOfBoundsRejectedCount: number;
  warning: string | null;
}

const COUNT_KEYS = [
  'localityRejectedCount',
  'cityScaleRejectedCount',
  'invalidRecordRejectedCount',
  'outOfBoundsRejectedCount'
] as const;

export function readAreaRiskSafetyFilter(
  feed: Record<string, unknown>
): AreaRiskSafetyFilterAuthority {
  const rawValue = feed.safetyFilter ?? feed.safety_filter;
  if (rawValue == null) {
    return emptyAreaRiskSafetyFilter(false, true);
  }
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return emptyAreaRiskSafetyFilter(true, false);
  }
  const record = rawValue as Record<string, unknown>;
  if (record.capability !== SAFE_ROUTE_RISK_SAFETY_FILTER_CAPABILITY) {
    return emptyAreaRiskSafetyFilter(true, false);
  }

  const counts = COUNT_KEYS.map((key) => exactCount(record[key]));
  const rejectedCount = exactCount(record.rejectedCount ?? record.rejected_count);
  if (rejectedCount === null || counts.some((count) => count === null)) {
    return emptyAreaRiskSafetyFilter(true, false);
  }
  const [
    localityRejectedCount,
    cityScaleRejectedCount,
    invalidRecordRejectedCount,
    outOfBoundsRejectedCount
  ] = counts as [number, number, number, number];
  if (
    rejectedCount !== localityRejectedCount
      + cityScaleRejectedCount
      + invalidRecordRejectedCount
      + outOfBoundsRejectedCount
  ) {
    return emptyAreaRiskSafetyFilter(true, false);
  }
  return {
    present: true,
    valid: true,
    rejectedCount,
    localityRejectedCount,
    cityScaleRejectedCount,
    invalidRecordRejectedCount,
    outOfBoundsRejectedCount,
    warning: areaRiskSafetyWarning(rejectedCount)
  };
}

export function areaRiskSafetyFiltersEqual(
  left: AreaRiskSafetyFilterAuthority,
  right: AreaRiskSafetyFilterAuthority
): boolean {
  return left.present === right.present
    && left.valid === right.valid
    && left.rejectedCount === right.rejectedCount
    && left.localityRejectedCount === right.localityRejectedCount
    && left.cityScaleRejectedCount === right.cityScaleRejectedCount
    && left.invalidRecordRejectedCount === right.invalidRecordRejectedCount
    && left.outOfBoundsRejectedCount === right.outOfBoundsRejectedCount;
}

export function aggregateAreaRiskSafetyFilters(
  authorities: readonly AreaRiskSafetyFilterAuthority[]
): AreaRiskSafetyFilterAuthority {
  if (!authorities.length || authorities.every((authority) => !authority.present)) {
    return emptyAreaRiskSafetyFilter(false, true);
  }
  if (
    authorities.some((authority) => !authority.present || !authority.valid)
  ) {
    return emptyAreaRiskSafetyFilter(true, false);
  }
  const localityRejectedCount = sumCounts(authorities, 'localityRejectedCount');
  const cityScaleRejectedCount = sumCounts(authorities, 'cityScaleRejectedCount');
  const invalidRecordRejectedCount = sumCounts(authorities, 'invalidRecordRejectedCount');
  const outOfBoundsRejectedCount = sumCounts(authorities, 'outOfBoundsRejectedCount');
  const rejectedCount = localityRejectedCount
    + cityScaleRejectedCount
    + invalidRecordRejectedCount
    + outOfBoundsRejectedCount;
  return {
    present: true,
    valid: true,
    rejectedCount,
    localityRejectedCount,
    cityScaleRejectedCount,
    invalidRecordRejectedCount,
    outOfBoundsRejectedCount,
    warning: areaRiskSafetyWarning(rejectedCount)
  };
}

export function areaRiskSafetyWarning(rejectedCount: number): string | null {
  if (!Number.isSafeInteger(rejectedCount) || rejectedCount <= 0) {
    return null;
  }
  return `SafeRoute excluded ${rejectedCount} unsafe or unverifiable risk ${
    rejectedCount === 1 ? 'area' : 'areas'
  }; coverage is partial.`;
}

function exactCount(value: unknown): number | null {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= 2400
    ? value
    : null;
}

function emptyAreaRiskSafetyFilter(
  present: boolean,
  valid: boolean
): AreaRiskSafetyFilterAuthority {
  return {
    present,
    valid,
    rejectedCount: 0,
    localityRejectedCount: 0,
    cityScaleRejectedCount: 0,
    invalidRecordRejectedCount: 0,
    outOfBoundsRejectedCount: 0,
    warning: null
  };
}

function sumCounts(
  authorities: readonly AreaRiskSafetyFilterAuthority[],
  key: typeof COUNT_KEYS[number]
): number {
  return authorities.reduce((total, authority) => total + authority[key], 0);
}
