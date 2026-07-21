import { readAreaRiskSafetyFilter } from './areaRiskSafetyFilter';

export type AreaRiskFeedAuthorityState = 'current' | 'pending' | 'partial' | 'failed';

export interface AreaRiskFeedAuthorityContext {
  clientId?: string | null;
  legacyFallback?: boolean;
}

export interface AreaRiskFeedAuthority {
  error: string | null;
  paginationSignature: string;
  state: AreaRiskFeedAuthorityState;
}

const FAILED_STATUSES = new Set([
  'cancelled',
  'error',
  'failed',
  'unavailable',
  'unconfigured'
]);
const SEED_PENDING_STATUSES = new Set([
  'pending',
  'queued',
  'refreshing',
  'researching',
  'scheduled'
]);
const PROVIDER_PENDING_STATUSES = new Set([
  'pending',
  'queued',
  'refreshing'
]);
const SEED_CURRENT_STATUSES = new Set([
  'completed',
  'covered',
  'current',
  'not-requested'
]);
const PROVIDER_CURRENT_STATUSES = new Set([
  'empty',
  'primary'
]);
const PROVIDER_PARTIAL_STATUSES = new Set([
  'degraded',
  'fallback'
]);

/**
 * Validates the semantic and privacy authority carried by a SafeRoute area-risk
 * page before any of its records can enter Mobile map, cache, or route state.
 * The accepted contract intentionally matches SafeRoute Web and the Backend.
 */
export function classifyAreaRiskFeedAuthority(
  payload: unknown,
  context: AreaRiskFeedAuthorityContext
): AreaRiskFeedAuthority {
  const feed = unwrapDataEnvelope(payload);
  const safetyFilter = readAreaRiskSafetyFilter(feed);
  const seedStatus = cleanOptionalText(feed.seedStatus ?? feed.seed_status, 80).toLowerCase();
  const providerStatus = cleanOptionalText(
    feed.providerStatus ?? feed.provider_status,
    80
  ).toLowerCase();
  const seedId = cleanOptionalText(feed.seedId ?? feed.seed_id, 160);
  const items = Array.isArray(feed.items) ? feed.items : [];
  const providerWarnings = readProviderWarnings(feed);
  const privacy = asRecord(feed.privacy);
  const tenantScopedSeed = privacy.tenantScopedSeed ?? privacy.tenant_scoped_seed;
  const sharedOutput = cleanOptionalText(
    privacy.sharedOutput ?? privacy.shared_output,
    80
  ).toLowerCase();
  const paginationSignature = JSON.stringify({
    providerStatus,
    providerWarnings,
    seedId,
    seedStatus,
    sharedOutput,
    tenantScopedSeed: typeof tenantScopedSeed === 'boolean'
      ? tenantScopedSeed
      : 'invalid'
  });

  if (safetyFilter.present && !safetyFilter.valid) {
    return failedAuthority(
      'SafeRoute risk coverage returned incompatible safety-filter authority.',
      paginationSignature
    );
  }

  const seedFailed = FAILED_STATUSES.has(seedStatus);
  const providerFailed = FAILED_STATUSES.has(providerStatus);
  if (seedFailed || providerFailed) {
    return failedAuthority(
      seedFailed && providerFailed
        ? 'SafeRoute risk provider and workspace research reported a failed result.'
        : (seedFailed
          ? 'SafeRoute workspace research did not complete for this map area.'
          : 'SafeRoute risk coverage provider reported a failed result.'),
      paginationSignature
    );
  }

  const expectsTenantSeed = Boolean(String(context.clientId || '').trim());
  const seedMatchesRequest = expectsTenantSeed || seedStatus === 'not-requested';

  if (context.legacyFallback && !seedStatus && !providerStatus) {
    return items.length > 0
      ? { error: null, paginationSignature, state: 'partial' }
      : failedAuthority(
          'Compatibility SafeRoute risk coverage returned no usable areas.',
          paginationSignature
        );
  }

  const seedStatusIsKnown = SEED_CURRENT_STATUSES.has(seedStatus)
    || SEED_PENDING_STATUSES.has(seedStatus)
    || seedStatus === 'skipped-large-aoi';
  if (!seedStatusIsKnown) {
    return failedAuthority(
      'SafeRoute risk coverage returned incompatible provider or research status.',
      paginationSignature
    );
  }

  if (providerStatus === 'external-fallback') {
    const externalPrivacyIsValid = tenantScopedSeed === false
      && sharedOutput === 'external-provider'
      && seedMatchesRequest;
    if (!externalPrivacyIsValid) {
      return failedAuthority(
        'SafeRoute fallback risk coverage returned incompatible privacy authority.',
        paginationSignature
      );
    }
    if (seedStatus === 'skipped-large-aoi') {
      return items.length > 0
        ? { error: null, paginationSignature, state: 'partial' }
        : failedAuthority(
            'SafeRoute workspace research could not cover this map area.',
            paginationSignature
          );
    }
    if (SEED_PENDING_STATUSES.has(seedStatus)) {
      return { error: null, paginationSignature, state: 'pending' };
    }
    if (safetyFilter.rejectedCount > 0) {
      return {
        error: safetyFilter.warning,
        paginationSignature,
        state: 'partial'
      };
    }
    return items.length > 0
      ? { error: null, paginationSignature, state: 'partial' }
      : failedAuthority(
          'SafeRoute fallback risk coverage did not return usable areas.',
          paginationSignature
        );
  }

  const providerStatusIsKnown = providerStatus === 'partial'
    || PROVIDER_CURRENT_STATUSES.has(providerStatus)
    || PROVIDER_PENDING_STATUSES.has(providerStatus)
    || PROVIDER_PARTIAL_STATUSES.has(providerStatus);
  if (!providerStatusIsKnown) {
    return failedAuthority(
      'SafeRoute risk coverage returned incompatible provider or research status.',
      paginationSignature
    );
  }

  const standardPrivacyIsValid = sharedOutput === 'sanitized-global'
    && tenantScopedSeed === expectsTenantSeed;
  if (!standardPrivacyIsValid || !seedMatchesRequest) {
    return failedAuthority(
      'SafeRoute risk coverage could not confirm the selected workspace authority.',
      paginationSignature
    );
  }

  if (seedStatus === 'skipped-large-aoi') {
    return items.length > 0
      ? { error: null, paginationSignature, state: 'partial' }
      : failedAuthority(
          'SafeRoute workspace research could not cover this map area.',
          paginationSignature
        );
  }
  if (
    SEED_PENDING_STATUSES.has(seedStatus)
    || PROVIDER_PENDING_STATUSES.has(providerStatus)
  ) {
    return { error: null, paginationSignature, state: 'pending' };
  }
  if (providerStatus === 'partial') {
    return safetyFilter.valid && safetyFilter.rejectedCount > 0
      ? {
          error: safetyFilter.warning,
          paginationSignature,
          state: 'partial'
        }
      : failedAuthority(
          'SafeRoute risk coverage returned incompatible safety-filter authority.',
          paginationSignature
        );
  }
  if (safetyFilter.rejectedCount > 0) {
    return {
      error: safetyFilter.warning,
      paginationSignature,
      state: 'partial'
    };
  }
  if (PROVIDER_PARTIAL_STATUSES.has(providerStatus)) {
    return items.length > 0
      ? { error: null, paginationSignature, state: 'partial' }
      : failedAuthority(
          'SafeRoute fallback risk coverage did not return usable areas.',
          paginationSignature
        );
  }
  if (providerWarnings.length > 0) {
    return items.length > 0
      ? { error: null, paginationSignature, state: 'partial' }
      : failedAuthority(
          'SafeRoute risk coverage provider reported a failed result.',
          paginationSignature
        );
  }
  if (
    SEED_CURRENT_STATUSES.has(seedStatus)
    && PROVIDER_CURRENT_STATUSES.has(providerStatus)
  ) {
    return { error: null, paginationSignature, state: 'current' };
  }
  return failedAuthority(
    'SafeRoute risk coverage returned an incompatible authority combination.',
    paginationSignature
  );
}

function readProviderWarnings(feed: Record<string, unknown>): string[] {
  const raw = [feed.providerErrors, feed.provider_errors].find(Array.isArray);
  return (Array.isArray(raw) ? raw : [])
    .map((warning) => cleanOptionalText(warning, 240).toLowerCase())
    .filter((warning) =>
      warning
      && !warning.includes('no generated area-risk zones are available')
    )
    .sort();
}

function failedAuthority(
  error: string,
  paginationSignature: string
): AreaRiskFeedAuthority {
  return { error, paginationSignature, state: 'failed' };
}

function unwrapDataEnvelope(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload);
  return asRecord(record.data ?? payload);
}

function cleanOptionalText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
    : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
