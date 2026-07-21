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
import {
  cacheViewportRiskZones,
  canCacheViewportRiskFeed,
  getCachedViewportRiskZones,
  isAreaRiskFeedFailed,
  isAreaRiskFeedMissing,
  isAreaRiskFeedPending,
  resolveViewportRiskCoverageOutcome,
  resolveViewportRiskDisplayZones,
  resolveViewportRiskUnavailableRecovery,
  type ViewportRiskCache,
  type ViewportRiskCoverageState
} from './viewportRiskState';

export const VIEWPORT_RISK_DEBOUNCE_MS = 450;
export const VIEWPORT_RISK_TIMEOUT_MS = 6000;
export const VIEWPORT_RISK_MAX_POLL_ATTEMPTS = 4;
export const VIEWPORT_RISK_MIN_POLL_MS = 1500;
export const VIEWPORT_RISK_MAX_POLL_MS = 10000;
export const VIEWPORT_RISK_MAX_UNAVAILABLE_AUTO_RETRIES = 1;
export const VIEWPORT_RISK_MAX_UNAVAILABLE_AUTO_RETRY_MS = 30000;
const VIEWPORT_RISK_DEFAULT_COOLDOWN_SECONDS = 30;

export function useViewportRiskAreas({
  accessToken,
  clientId,
  enabled = true,
  onSessionExpired,
  onWorkspaceUnavailable,
  region
}: {
  accessToken?: string | null;
  clientId?: string | null;
  enabled?: boolean;
  onSessionExpired?: (message?: string) => void;
  onWorkspaceUnavailable?: (workspaceId: string) => void;
  region: Region;
}) {
  const cacheRef = useRef<ViewportRiskCache>(new Map());
  const accessSessionIdentityRef = useRef({
    identity: 0,
    token: String(accessToken || '').trim()
  });
  const cacheScopeContextRef = useRef('');
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
  const normalizedAccessToken = String(accessToken || '').trim();
  const normalizedClientId = String(clientId || '').trim();
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
  const cacheScopeContext = `${enabled ? 'enabled' : 'disabled'}|${accessContext}`;
  const displayContext = `${cacheScopeContext}|${requestSignature}`;
  const researchAvailable = enabled
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
    requestSignature
  });
  const previousEligibility = requestEligibilityRef.current;
  if (
    previousEligibility.accessToken !== accessToken
    || previousEligibility.clientId !== clientId
    || previousEligibility.enabled !== enabled
    || previousEligibility.requestSignature !== requestSignature
  ) {
    requestEligibilityEpochRef.current += 1;
    requestEligibilityRef.current = {
      accessToken,
      clientId,
      enabled,
      requestSignature
    };
  }
  requestsRef.current = requests;
  zonesRef.current = zones;
  clientIdRef.current = clientId;
  onSessionExpiredRef.current = onSessionExpired;
  onWorkspaceUnavailableRef.current = onWorkspaceUnavailable;

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
      && requestEligibilityEpochRef.current === requestEligibilityEpoch;
    let followupTimer: ReturnType<typeof setTimeout> | null = null;

    const contextChanged = displayContextRef.current !== displayContext;
    const cacheScopeChanged = cacheScopeContextRef.current !== cacheScopeContext;
    if (contextChanged) {
      displayContextRef.current = displayContext;
      if (cacheScopeChanged) {
        cacheScopeContextRef.current = cacheScopeContext;
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
    for (const request of activeRequests) {
      const cached = getCachedViewportRiskZones(cacheRef.current, request);
      if (cached) {
        cachedZones.push(cached);
      }
      if (bypassCache || !cached) {
        requestsToLoad.push(request);
      }
    }

    if (!requestsToLoad.length) {
      const nextZones = mergeRiskZonesById(...cachedZones);
      setZones(nextZones);
      setLoading(false);
      setErrorMessage('');
      setStatusMessage(nextZones.length ? 'Cached risk coverage.' : 'No cached risks in this map view.');
      setCoverageState('cached');
      return () => controller.abort();
    }

    const cachedResult = mergeRiskZonesById(...cachedZones);
    const retainedZones = cacheScopeChanged ? [] : zonesRef.current;
    setZones(resolveViewportRiskDisplayZones(retainedZones, cachedResult, false));
    setLoading(true);
    setErrorMessage('');
    setStatusMessage(
      researchRequested
        ? 'Requesting risk research…'
        : (recoveryRequested ? 'Retrying risk areas…' : 'Loading risk areas…')
    );
    setCoverageState('loading');
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
            cacheViewportRiskZones(cacheRef.current, request, feed.zones);
          }
          if (feed.readError && !feed.zones.length) {
            failedRequestCount += 1;
          }
          setZones(resolveViewportRiskDisplayZones(
            retainedZones,
            mergeRiskZonesById(...cachedZones, ...receivedZones),
            false
          ));
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
        const nextZones = mergeRiskZonesById(...cachedZones, ...receivedZones);
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
        const visibleZones = resolveViewportRiskDisplayZones(
          unavailableRequestCount > 0 ? [] : retainedZones,
          allRequestsFailed ? cachedResult : nextZones,
          replacementReady
        );
        setZones(visibleZones);

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
    displayContext,
    enabled,
    pollRevision,
    recoveryRevision,
    researchRevision,
    requestSignature,
    retryRevision
  ]);

  const retry = useCallback(() => {
    if (readBlockedUntilMs <= Date.now()) {
      setRetryRevision((revision) => revision + 1);
    }
  }, [readBlockedUntilMs]);
  const research = useCallback(() => {
    if (
      researchAvailable
      && researchBlockedUntilMs <= Date.now()
      && readBlockedUntilMs <= Date.now()
    ) {
      setResearchRevision((revision) => revision + 1);
    }
  }, [readBlockedUntilMs, researchAvailable, researchBlockedUntilMs]);

  return {
    coverageState,
    errorMessage,
    loading,
    research,
    researchAvailable,
    retry,
    retryAvailable: readBlockedUntilMs <= Date.now(),
    statusMessage,
    zones: cacheScopeContextRef.current === cacheScopeContext ? zones : []
  };
}
