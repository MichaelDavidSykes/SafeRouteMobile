import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Region } from 'react-native-maps';

import { getRequestSessionExpiry } from '../api/sessionExpiry';
import { getRequestUnavailableWorkspaceId } from '../workspaces/workspaceAccessRecovery';
import {
  fetchAreaRiskViewport,
  getAreaRiskRetryableReadFailure
} from './areaRiskApi';
import {
  areaRiskViewportRequestKey,
  canRequestAreaRiskResearch,
  mergeRiskZonesById,
  regionToAreaRiskViewportRequests,
  type AreaRiskViewportRequest
} from './areaRiskApiCore';
import type { RiskZone } from './liveMapTypes';
import { useWorkspaceRiskAreas } from './useWorkspaceRiskAreas';
import { viewportRiskPersistentCache } from './viewportRiskPersistentCache';
import {
  VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS,
  mergeViewportRiskCaches,
  normalizeViewportRiskCacheScopeId
} from './viewportRiskPersistentCacheCore';
import {
  cacheViewportRiskZones,
  canCacheViewportRiskFeed,
  collectFreshViewportRiskZonesForRequests,
  getCachedViewportRiskZones,
  isAreaRiskFeedFailed,
  isAreaRiskFeedMissing,
  isAreaRiskFeedPending,
  resolveCompletedViewportRiskZones,
  resolveUnavailableViewportRiskZones,
  resolveViewportRiskCoverageOutcome,
  resolveViewportRiskDisplayZones,
  resolveViewportRiskUnavailableRecovery,
  shouldRevalidateViewportRiskRequest,
  type ViewportRiskCache,
  type ViewportRiskCoverageState
} from './viewportRiskState';

export const VIEWPORT_RISK_DEBOUNCE_MS = 260;
export const VIEWPORT_RISK_TIMEOUT_MS = 6000;
export const VIEWPORT_RISK_MAX_POLL_ATTEMPTS = 4;
export const VIEWPORT_RISK_MIN_POLL_MS = 1500;
export const VIEWPORT_RISK_MAX_POLL_MS = 10000;
export const VIEWPORT_RISK_MAX_UNAVAILABLE_AUTO_RETRIES = 1;
export const VIEWPORT_RISK_MAX_UNAVAILABLE_AUTO_RETRY_MS = 30000;
export const VIEWPORT_RISK_LIVE_REFRESH_MS = 15000;
const VIEWPORT_RISK_DEFAULT_COOLDOWN_SECONDS = 30;

export function useViewportRiskAreas({
  accessToken,
  cacheScopeId,
  clientId,
  enabled = true,
  onSessionExpired,
  onWorkspaceUnavailable,
  refreshEnabled = true,
  region
}: {
  accessToken?: string | null;
  cacheScopeId?: string | null;
  clientId?: string | null;
  enabled?: boolean;
  onSessionExpired?: (message?: string) => void;
  onWorkspaceUnavailable?: (workspaceId: string) => void;
  refreshEnabled?: boolean;
  region: Region;
}) {
  const normalizedAccessToken = String(accessToken || '').trim();
  const normalizedClientId = String(clientId || '').trim();
  const normalizedCacheScopeId = normalizeViewportRiskCacheScopeId(
    cacheScopeId
  ) || (
    normalizedAccessToken && normalizedClientId
      ? `workspace:${normalizedClientId}`
      : 'guest'
  );
  const workspaceRisk = useWorkspaceRiskAreas({
    accessToken,
    cacheScopeId: normalizedCacheScopeId,
    clientId,
    enabled,
    onSessionExpired,
    onWorkspaceUnavailable,
    refreshEnabled,
    region
  });
  const cacheRef = useRef<ViewportRiskCache>(new Map());
  const accessSessionIdentityRef = useRef({
    identity: 0,
    token: String(accessToken || '').trim()
  });
  const cacheScopeContextRef = useRef('');
  const cacheStorageScopeRef = useRef('');
  const clientIdRef = useRef(clientId);
  const displayContextRef = useRef('');
  const handledPollRevisionRef = useRef(0);
  const handledRecoveryRevisionRef = useRef(0);
  const handledResearchRevisionRef = useRef(0);
  const handledRetryRevisionRef = useRef(0);
  const legacyCompatibilityScopeRef = useRef('');
  const onSessionExpiredRef = useRef(onSessionExpired);
  const onWorkspaceUnavailableRef = useRef(onWorkspaceUnavailable);
  const pollStateRef = useRef({ attempts: 0, context: '' });
  const unavailableRetryStateRef = useRef({ attempts: 0, context: '' });
  const persistentCacheLoadRevisionRef = useRef(0);
  const requestRevisionRef = useRef(0);
  const requestsRef = useRef<AreaRiskViewportRequest[]>([]);
  const zonesRef = useRef<RiskZone[]>([]);
  const [coverageState, setCoverageState] = useState<ViewportRiskCoverageState>('idle');
  const [zones, setZones] = useState<RiskZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [retryRevision, setRetryRevision] = useState(0);
  const [researchRevision, setResearchRevision] = useState(0);
  const [pollRevision, setPollRevision] = useState(0);
  const [recoveryRevision, setRecoveryRevision] = useState(0);
  const [researchBlockedUntilMs, setResearchBlockedUntilMs] = useState(0);
  const [readBlockedUntilMs, setReadBlockedUntilMs] = useState(0);
  const [persistentCacheRevision, setPersistentCacheRevision] = useState(0);
  if (accessSessionIdentityRef.current.token !== normalizedAccessToken) {
    accessSessionIdentityRef.current = {
      identity: accessSessionIdentityRef.current.identity + 1,
      token: normalizedAccessToken
    };
  }
  const requests = useMemo(
    () => regionToAreaRiskViewportRequests(region, {
      clientId: normalizedAccessToken && normalizedClientId
        ? normalizedClientId
        : undefined
    }),
    [
      normalizedAccessToken,
      normalizedClientId,
      region.latitude,
      region.longitude,
      region.latitudeDelta,
      region.longitudeDelta
    ]
  );
  const requestSignature = useMemo(
    () => requests.map((request) => areaRiskViewportRequestKey(request)).join('|'),
    [requests]
  );
  const accessContext = normalizedAccessToken && normalizedClientId
    ? `tenant:${normalizedClientId}:session-${accessSessionIdentityRef.current.identity}`
    : 'public';
  // Session changes invalidate in-flight requests, but a workspace-scoped
  // cache remains valid across token refreshes and should stay visible.
  const cacheStorageScope =
    `${enabled ? 'enabled' : 'disabled'}|${normalizedCacheScopeId}`;
  const cacheScopeContext =
    `${cacheStorageScope}|${accessContext}`;
  const displayContext = `${cacheScopeContext}|${requestSignature}`;
  const researchAvailable = enabled
    && refreshEnabled
    && researchBlockedUntilMs <= Date.now()
    && readBlockedUntilMs <= Date.now()
    && requests.length > 0
    && requests.every((request) =>
      canRequestAreaRiskResearch(request, normalizedAccessToken)
    );
  const requestEligibilityEpochRef = useRef(0);
  const requestEligibilityRef = useRef({
    accessToken,
    clientId,
    enabled,
    refreshEnabled,
    requestSignature
  });
  const previousEligibility = requestEligibilityRef.current;
  if (
    previousEligibility.accessToken !== accessToken
    || previousEligibility.clientId !== clientId
    || previousEligibility.enabled !== enabled
    || previousEligibility.refreshEnabled !== refreshEnabled
    || previousEligibility.requestSignature !== requestSignature
  ) {
    requestEligibilityEpochRef.current += 1;
    requestEligibilityRef.current = {
      accessToken,
      clientId,
      enabled,
      refreshEnabled,
      requestSignature
    };
  }
  requestsRef.current = requests;
  zonesRef.current = zones;
  clientIdRef.current = clientId;
  onSessionExpiredRef.current = onSessionExpired;
  onWorkspaceUnavailableRef.current = onWorkspaceUnavailable;

  useEffect(() => {
    const loadRevision = persistentCacheLoadRevisionRef.current + 1;
    persistentCacheLoadRevisionRef.current = loadRevision;
    let active = true;
    if (!enabled) {
      return () => {
        active = false;
      };
    }

    void viewportRiskPersistentCache.load(normalizedCacheScopeId).then(
      (restoredCache) => {
        if (
          !active
          || persistentCacheLoadRevisionRef.current !== loadRevision
          || !restoredCache.size
        ) {
          return;
        }
        cacheRef.current = mergeViewportRiskCaches(
          cacheRef.current,
          restoredCache
        );
        setPersistentCacheRevision((revision) => revision + 1);
      }
    );

    return () => {
      active = false;
    };
  }, [enabled, normalizedCacheScopeId]);

  useEffect(() => {
    const remainingMs = researchBlockedUntilMs - Date.now();
    if (remainingMs <= 0) {
      return;
    }
    const timer = setTimeout(
      () => setResearchBlockedUntilMs(0),
      remainingMs
    );
    return () => clearTimeout(timer);
  }, [researchBlockedUntilMs]);

  useEffect(() => {
    const remainingMs = readBlockedUntilMs - Date.now();
    if (remainingMs <= 0) {
      return;
    }
    const timer = setTimeout(
      () => setReadBlockedUntilMs(0),
      remainingMs
    );
    return () => clearTimeout(timer);
  }, [readBlockedUntilMs]);

  useEffect(() => {
    if (!enabled || !refreshEnabled || !requestSignature) {
      return;
    }
    const timer = setInterval(() => {
      setPollRevision((revision) => revision + 1);
    }, VIEWPORT_RISK_LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [enabled, refreshEnabled, requestSignature]);

  useEffect(() => {
    const revision = requestRevisionRef.current + 1;
    requestRevisionRef.current = revision;
    const requestEligibilityEpoch = requestEligibilityEpochRef.current;
    const controller = new AbortController();
    const activeRequests = requestsRef.current;
    const researchRequested = handledResearchRevisionRef.current !== researchRevision;
    const retryRequested = handledRetryRevisionRef.current !== retryRevision;
    const pollRequested = handledPollRevisionRef.current !== pollRevision;
    const recoveryRequested = handledRecoveryRevisionRef.current !== recoveryRevision;
    handledResearchRevisionRef.current = researchRevision;
    handledRetryRevisionRef.current = retryRevision;
    handledPollRevisionRef.current = pollRevision;
    handledRecoveryRevisionRef.current = recoveryRevision;
    const bypassCache = researchRequested || retryRequested || pollRequested || recoveryRequested;
    const requestIsCurrent = () =>
      !controller.signal.aborted
      && requestRevisionRef.current === revision
      && requestEligibilityRef.current.enabled
      && requestEligibilityRef.current.refreshEnabled
      && requestEligibilityEpochRef.current === requestEligibilityEpoch;
    let followupTimer: ReturnType<typeof setTimeout> | null = null;

    const contextChanged = displayContextRef.current !== displayContext;
    const cacheScopeChanged = cacheStorageScopeRef.current !== cacheStorageScope;
    if (contextChanged) {
      displayContextRef.current = displayContext;
      cacheScopeContextRef.current = cacheScopeContext;
      if (cacheScopeChanged) {
        cacheStorageScopeRef.current = cacheStorageScope;
        cacheRef.current.clear();
        zonesRef.current = [];
        setZones([]);
        legacyCompatibilityScopeRef.current = '';
      }
      setResearchBlockedUntilMs(0);
      pollStateRef.current = { attempts: 0, context: displayContext };
      unavailableRetryStateRef.current = { attempts: 0, context: displayContext };
      setReadBlockedUntilMs(0);
    } else if (pollStateRef.current.context !== displayContext) {
      pollStateRef.current = { attempts: 0, context: displayContext };
    }
    if (unavailableRetryStateRef.current.context !== displayContext) {
      unavailableRetryStateRef.current = { attempts: 0, context: displayContext };
    }
    if (researchRequested || retryRequested) {
      pollStateRef.current = { attempts: 0, context: displayContext };
      unavailableRetryStateRef.current = { attempts: 0, context: displayContext };
    }

    if (!enabled) {
      setLoading(false);
      setZones([]);
      setErrorMessage('');
      setStatusMessage('');
      setCoverageState('idle');
      return () => controller.abort();
    }

    if (!activeRequests.length) {
      setLoading(false);
      setErrorMessage('');
      setStatusMessage('Risk areas are waiting for a valid map view.');
      setCoverageState('idle');
      return () => controller.abort();
    }

    const cachedZones: RiskZone[][] = [];
    const requestsToLoad: AreaRiskViewportRequest[] = [];
    let cachedRequestCount = 0;
    for (const request of activeRequests) {
      const cached = getCachedViewportRiskZones(cacheRef.current, request, {
        ttlMs: VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS
      });
      if (cached) {
        cachedRequestCount += 1;
        cachedZones.push(cached);
      }
      if (shouldRevalidateViewportRiskRequest(cacheRef.current, request, {
        bypassCache,
      })) {
        requestsToLoad.push(request);
      }
    }

    const nearbyCachedResult = collectFreshViewportRiskZonesForRequests(
      cacheRef.current,
      activeRequests,
      {
        ttlMs: VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS
      }
    );
    const cachedResult = mergeRiskZonesById(
      ...cachedZones,
      nearbyCachedResult
    );
    const hasCompleteCachedCoverage =
      cachedRequestCount === activeRequests.length;
    const retainedZones = cacheScopeChanged ? [] : zonesRef.current;
    if (!refreshEnabled) {
      const offlineZones = resolveViewportRiskDisplayZones(
        retainedZones,
        cachedResult,
        false
      );
      setZones(offlineZones);
      setLoading(false);
      setErrorMessage('');
      setStatusMessage(
        hasCompleteCachedCoverage
          ? (
            offlineZones.length
              ? 'Cached risks are available while SafeRoute is offline.'
              : 'Cached coverage is available while SafeRoute is offline.'
          )
          : (
            offlineZones.length
              ? 'Previously loaded risks remain visible while SafeRoute is offline.'
              : ''
          )
      );
      setCoverageState(
        hasCompleteCachedCoverage
          ? 'cached'
          : (offlineZones.length ? 'stale' : 'idle')
      );
      return () => controller.abort();
    }
    if (!requestsToLoad.length) {
      setZones(resolveViewportRiskDisplayZones(retainedZones, cachedResult, true));
      setLoading(false);
      setErrorMessage('');
      setStatusMessage(
        cachedResult.length
          ? 'Current risks are available for this map view.'
          : 'No current risk areas in this map view.'
      );
      setCoverageState(cachedResult.length ? 'current' : 'current-empty');
      return () => controller.abort();
    }
    setZones(resolveViewportRiskDisplayZones(retainedZones, cachedResult, false));
    setLoading(!hasCompleteCachedCoverage);
    setErrorMessage('');
    setStatusMessage(
      hasCompleteCachedCoverage
        ? (
          cachedResult.length
            ? 'Cached risks are visible while SafeRoute checks for updates.'
            : 'Cached coverage is visible while SafeRoute checks for updates.'
        )
        : (
          researchRequested
            ? 'Requesting risk research…'
            : (recoveryRequested
              ? 'Retrying risk areas…'
              : 'Loading risk areas…')
        )
    );
    setCoverageState(hasCompleteCachedCoverage ? 'cached' : 'loading');
    const timer = setTimeout(() => {
      if (!requestIsCurrent()) {
        return;
      }
      const receivedZones: RiskZone[][] = [];
      let failedRequestCount = 0;
      let successfulRequestCount = 0;
      let pendingRequestCount = 0;
      let partialRequestCount = 0;
      let readFailureCount = 0;
      let researchFailureCount = 0;
      let safetyRejectedRequestCount = 0;
      let statusFailureCount = 0;
      let unavailableRequestCount = 0;
      let unavailableRetryAfterSeconds = 0;
      let missingRequestCount = 0;
      let cooldownRequestCount = 0;
      let cooldownRetryAfterSeconds = 0;
      let legacyFallbackCount = 0;
      let retryAfterSeconds = 0;
      let currentEmptyResearchCount = 0;
      let sessionExpiryHandled = false;
      let workspaceUnavailableHandled = false;
      let cacheUpdated = false;
      const downloads = requestsToLoad.map(async (request) => {
        try {
          const feed = await fetchAreaRiskViewport(request, {
            accessToken,
            bypassCache,
            intent: researchRequested ? 'research' : 'read',
            signal: controller.signal,
            timeoutMs: VIEWPORT_RISK_TIMEOUT_MS
          });
          if (!requestIsCurrent()) {
            return;
          }
          const cooldown = feed.research?.status === 'cooldown';
          const pending = !cooldown && isAreaRiskFeedPending(feed);
          if (pending) {
            pendingRequestCount += 1;
          }
          if (cooldown) {
            cooldownRequestCount += 1;
            const retryAfterSeconds = Math.max(
              VIEWPORT_RISK_DEFAULT_COOLDOWN_SECONDS,
              feed.research?.retryAfterSeconds ?? 0
            );
            cooldownRetryAfterSeconds = Math.max(
              cooldownRetryAfterSeconds,
              retryAfterSeconds
            );
            setResearchBlockedUntilMs((current) => Math.max(
              current,
              Date.now() + retryAfterSeconds * 1000
            ));
          }
          if (feed.partial) {
            partialRequestCount += 1;
          }
          if (feed.readError) {
            readFailureCount += 1;
          } else {
            successfulRequestCount += 1;
          }
          if (feed.retryableReadFailure) {
            unavailableRequestCount += 1;
            unavailableRetryAfterSeconds = Math.max(
              unavailableRetryAfterSeconds,
              feed.retryableReadFailure.retryAfterSeconds
            );
          }
          if (feed.researchError) {
            researchFailureCount += 1;
          }
          if (feed.discardedUnsafeAreaCount > 0) {
            safetyRejectedRequestCount += 1;
          }
          if (feed.legacyFallback) {
            legacyFallbackCount += 1;
            legacyCompatibilityScopeRef.current = cacheScopeContext;
          }
          if (isAreaRiskFeedFailed(feed)) {
            statusFailureCount += 1;
          }
          if (isAreaRiskFeedMissing(feed, {
            requireTenantResearch: Boolean(request.clientId)
          })) {
            missingRequestCount += 1;
          }
          if (feed.research?.status === 'current-empty') {
            currentEmptyResearchCount += 1;
          }
          retryAfterSeconds = Math.max(
            retryAfterSeconds,
            feed.research?.retryAfterSeconds ?? 0
          );
          if (feed.zones.length) {
            receivedZones.push(feed.zones);
          }
          if (canCacheViewportRiskFeed(feed, {
            requireTenantResearch: Boolean(request.clientId)
          })) {
            cacheViewportRiskZones(cacheRef.current, request, feed.zones, {
              ttlMs: VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS
            });
            cacheUpdated = true;
          }
          if (feed.readError && !feed.zones.length) {
            failedRequestCount += 1;
          }
        } catch (error) {
          if (!requestIsCurrent()) {
            return;
          }
          const sessionExpiry = getRequestSessionExpiry({
            authenticated: Boolean(accessToken && onSessionExpiredRef.current),
            error,
            handled: sessionExpiryHandled,
            requestActive:
              requestIsCurrent()
              && clientIdRef.current === clientId
          });
          if (sessionExpiry) {
            sessionExpiryHandled = true;
            controller.abort();
            setZones([]);
            setLoading(false);
            setStatusMessage('');
            setCoverageState('failed');
            onSessionExpiredRef.current?.(sessionExpiry.message);
            return;
          }
          const unavailableWorkspaceId = getRequestUnavailableWorkspaceId({
            accessToken,
            error,
            handled: workspaceUnavailableHandled,
            requestActive:
              requestIsCurrent()
              && clientIdRef.current === clientId
              && Boolean(onWorkspaceUnavailableRef.current),
            workspaceId: clientId
          });
          if (unavailableWorkspaceId) {
            workspaceUnavailableHandled = true;
            requestRevisionRef.current += 1;
            controller.abort();
            cacheRef.current.clear();
            void viewportRiskPersistentCache.clear(
              normalizedCacheScopeId
            ).catch(() => undefined);
            setZones([]);
            setLoading(false);
            setErrorMessage('');
            setStatusMessage('');
            setCoverageState('failed');
            onWorkspaceUnavailableRef.current?.(unavailableWorkspaceId);
            return;
          }
          const retryableReadFailure = getAreaRiskRetryableReadFailure(error);
          if (retryableReadFailure) {
            unavailableRequestCount += 1;
            unavailableRetryAfterSeconds = Math.max(
              unavailableRetryAfterSeconds,
              retryableReadFailure.retryAfterSeconds
            );
          }
          failedRequestCount += 1;
        }
      });

      void Promise.allSettled(downloads).then(() => {
        if (!requestIsCurrent()) {
          return;
        }
        const nextZones = mergeRiskZonesById(cachedResult, ...receivedZones);
        const allRequestsFailed =
          failedRequestCount === requestsToLoad.length
          && successfulRequestCount === 0;
        const replacementReady = failedRequestCount === 0
          && partialRequestCount === 0
          && pendingRequestCount === 0
          && readFailureCount === 0
          && statusFailureCount === 0
          && missingRequestCount === 0
          && cooldownRequestCount === 0;
        const replacementZones = resolveCompletedViewportRiskZones(
          cachedResult,
          mergeRiskZonesById(...receivedZones),
          bypassCache
        );
        const visibleZones = resolveViewportRiskDisplayZones(
          unavailableRequestCount > 0
            ? resolveUnavailableViewportRiskZones(retainedZones, contextChanged)
            : retainedZones,
          allRequestsFailed
            ? cachedResult
            : (replacementReady ? replacementZones : nextZones),
          replacementReady
        );
        setZones(visibleZones);
        if (cacheUpdated) {
          void viewportRiskPersistentCache.save(
            normalizedCacheScopeId,
            cacheRef.current
          ).catch(() => undefined);
        }

        const outcome = resolveViewportRiskCoverageOutcome({
          allRequestsFailed,
          cooldownRequestCount,
          cooldownRetryAfterSeconds,
          currentEmptyResearchCount,
          failedRequestCount,
          missingRequestCount,
          partialRequestCount,
          pendingRequestCount,
          readFailureCount,
          researchAvailable,
          researchFailureCount,
          researchRequested,
          safetyRejectedRequestCount,
          statusFailureCount,
          unavailableRequestCount,
          unavailableRetryAfterSeconds,
          visibleZoneCount: visibleZones.length
        });
        setErrorMessage(outcome.errorMessage);
        setStatusMessage(outcome.statusMessage);
        setCoverageState(outcome.coverageState);
        setLoading(false);

        if (unavailableRequestCount > 0) {
          const retryState = unavailableRetryStateRef.current;
          const recovery = resolveViewportRiskUnavailableRecovery({
            attempts: retryState.attempts,
            context: retryState.context,
            currentContext: displayContext,
            maxAutoRetries: VIEWPORT_RISK_MAX_UNAVAILABLE_AUTO_RETRIES,
            maxAutoRetryMs: VIEWPORT_RISK_MAX_UNAVAILABLE_AUTO_RETRY_MS,
            nowMs: Date.now(),
            retryAfterSeconds: unavailableRetryAfterSeconds
          });
          setReadBlockedUntilMs((current) => Math.max(
            current,
            recovery.blockedUntilMs
          ));
          if (recovery.scheduleDelayMs !== null) {
            retryState.attempts += 1;
            followupTimer = setTimeout(() => {
              if (requestIsCurrent()) {
                setRecoveryRevision((value) => value + 1);
              }
            }, recovery.scheduleDelayMs);
          }
          return;
        }
        setReadBlockedUntilMs(0);
        unavailableRetryStateRef.current = { attempts: 0, context: displayContext };

        if (pendingRequestCount > 0) {
          if (
            legacyFallbackCount > 0
            || legacyCompatibilityScopeRef.current === cacheScopeContext
          ) {
            setErrorMessage(
              'Compatibility research is in progress. Check again later.'
            );
            setStatusMessage(
              visibleZones.length
                ? 'Existing risks remain visible while compatibility research runs.'
                : 'Compatibility research is still in progress.'
            );
            setCoverageState('pending-timeout');
            return;
          }
          const pollState = pollStateRef.current;
          if (
            pollState.context === displayContext
            && pollState.attempts < VIEWPORT_RISK_MAX_POLL_ATTEMPTS
          ) {
            pollState.attempts += 1;
            const delayMs = Math.max(
              VIEWPORT_RISK_MIN_POLL_MS,
              Math.min(
                VIEWPORT_RISK_MAX_POLL_MS,
                (retryAfterSeconds || 2) * 1000
              )
            );
            followupTimer = setTimeout(() => {
              if (requestIsCurrent()) {
                setPollRevision((value) => value + 1);
              }
            }, delayMs);
          } else {
            setErrorMessage('Risk research is still in progress. Check again.');
            setStatusMessage(
              visibleZones.length
                ? 'Risk research is still in progress. Existing risks remain visible.'
                : 'Risk research is still in progress. Check again shortly.'
            );
            setCoverageState('pending-timeout');
          }
        }
      });
    }, VIEWPORT_RISK_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      if (followupTimer) {
        clearTimeout(followupTimer);
      }
      controller.abort();
    };
  }, [
    accessToken,
    cacheScopeContext,
    cacheStorageScope,
    displayContext,
    enabled,
    normalizedCacheScopeId,
    pollRevision,
    persistentCacheRevision,
    recoveryRevision,
    refreshEnabled,
    researchRevision,
    requestSignature,
    retryRevision
  ]);

  const retryProviderRisk = useCallback(() => {
    if (readBlockedUntilMs <= Date.now()) {
      setRetryRevision((revision) => revision + 1);
    }
  }, [readBlockedUntilMs]);
  const retry = useCallback(() => {
    retryProviderRisk();
    workspaceRisk.retry();
  }, [retryProviderRisk, workspaceRisk.retry]);
  const research = useCallback(() => {
    if (
      researchAvailable
      && researchBlockedUntilMs <= Date.now()
      && readBlockedUntilMs <= Date.now()
    ) {
      setResearchRevision((revision) => revision + 1);
    }
  }, [readBlockedUntilMs, researchAvailable, researchBlockedUntilMs]);

  const providerZones = cacheScopeContextRef.current === cacheScopeContext ? zones : [];
  const visibleZones = useMemo(
    () => mergeRiskZonesById(providerZones, workspaceRisk.zones),
    [providerZones, workspaceRisk.zones]
  );
  const workspacePartial = Boolean(workspaceRisk.errorMessage);

  return {
    coverageState: workspacePartial && coverageState !== 'failed'
      ? 'partial' as const
      : coverageState,
    errorMessage: errorMessage || workspaceRisk.errorMessage,
    loading: loading || workspaceRisk.loading,
    research,
    researchAvailable,
    retry,
    retryAvailable:
      readBlockedUntilMs <= Date.now() || workspacePartial,
    statusMessage: workspacePartial && providerZones.length
      ? 'Generated risks remain visible while shared workspace risks are unavailable.'
      : statusMessage,
    zones: visibleZones
  };
}
