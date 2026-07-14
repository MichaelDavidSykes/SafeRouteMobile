import { useEffect, useMemo, useRef, useState } from 'react';
import type { Region } from 'react-native-maps';

import { getRequestSessionExpiry } from '../api/sessionExpiry';
import { getRequestUnavailableWorkspaceId } from '../workspaces/workspaceAccessRecovery';
import { fetchAreaRiskViewport } from './areaRiskApi';
import {
  areaRiskViewportRequestKey,
  mergeRiskZonesById,
  regionToAreaRiskViewportRequests,
  type AreaRiskViewportRequest
} from './areaRiskApiCore';
import type { RiskZone } from './liveMapTypes';
import {
  cacheViewportRiskZones,
  getCachedViewportRiskZones,
  resolveViewportRiskDisplayZones,
  type ViewportRiskCache
} from './viewportRiskState';

export const VIEWPORT_RISK_DEBOUNCE_MS = 450;
export const VIEWPORT_RISK_TIMEOUT_MS = 6000;

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
  const clientIdRef = useRef(clientId);
  const onSessionExpiredRef = useRef(onSessionExpired);
  const onWorkspaceUnavailableRef = useRef(onWorkspaceUnavailable);
  const requestRevisionRef = useRef(0);
  const requestsRef = useRef<AreaRiskViewportRequest[]>([]);
  const zonesRef = useRef<RiskZone[]>([]);
  const [zones, setZones] = useState<RiskZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [retryRevision, setRetryRevision] = useState(0);
  const requests = useMemo(
    () => regionToAreaRiskViewportRequests(region, {
      clientId: clientId || undefined
    }),
    [
      clientId,
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
  requestsRef.current = requests;
  zonesRef.current = zones;
  clientIdRef.current = clientId;
  onSessionExpiredRef.current = onSessionExpired;
  onWorkspaceUnavailableRef.current = onWorkspaceUnavailable;

  useEffect(() => {
    const revision = requestRevisionRef.current + 1;
    requestRevisionRef.current = revision;
    const controller = new AbortController();
    const activeRequests = requestsRef.current;

    if (!enabled) {
      setLoading(false);
      setZones([]);
      setErrorMessage('');
      setStatusMessage('');
      return () => controller.abort();
    }

    if (!activeRequests.length) {
      setLoading(false);
      setErrorMessage('');
      setStatusMessage(
        zonesRef.current.length ? '' : 'Risk areas are waiting for a valid map view.'
      );
      return () => controller.abort();
    }

    const cachedZones: RiskZone[][] = [];
    const missingRequests: AreaRiskViewportRequest[] = [];
    for (const request of activeRequests) {
      const cached = getCachedViewportRiskZones(cacheRef.current, request);
      if (cached) {
        cachedZones.push(cached);
      } else {
        missingRequests.push(request);
      }
    }

    if (!missingRequests.length) {
      setZones(mergeRiskZonesById(...cachedZones));
      setLoading(false);
      setErrorMessage('');
      setStatusMessage('');
      return () => controller.abort();
    }

    const cachedResult = mergeRiskZonesById(...cachedZones);
    const retainedZones = zonesRef.current;
    // Keep already-rendered overlays in place until the stable replacement
    // partition arrives. Minor map adjustments therefore never flash empty.
    setZones(resolveViewportRiskDisplayZones(retainedZones, cachedResult, false));
    setLoading(true);
    setErrorMessage('');
    setStatusMessage('Loading risk areas…');
    const timer = setTimeout(() => {
      const receivedZones: RiskZone[][] = [];
      let failedRequestCount = 0;
      let successfulRequestCount = 0;
      let sessionExpiryHandled = false;
      let workspaceUnavailableHandled = false;
      const downloads = missingRequests.map(async (request) => {
        try {
          const feed = await fetchAreaRiskViewport(request, {
            accessToken,
            signal: controller.signal,
            timeoutMs: VIEWPORT_RISK_TIMEOUT_MS
          });
          if (controller.signal.aborted || requestRevisionRef.current !== revision) {
            return;
          }
          cacheViewportRiskZones(cacheRef.current, request, feed.zones);
          successfulRequestCount += 1;
          receivedZones.push(feed.zones);
          // Antimeridian views have two chunks. Reveal the first successful
          // chunk as soon as it lands instead of waiting for the slower one.
          setZones(resolveViewportRiskDisplayZones(
            retainedZones,
            mergeRiskZonesById(...cachedZones, ...receivedZones),
            false
          ));
        } catch (error) {
          if (controller.signal.aborted || requestRevisionRef.current !== revision) {
            return;
          }
          const sessionExpiry = getRequestSessionExpiry({
            authenticated: Boolean(accessToken && onSessionExpiredRef.current),
            error,
            handled: sessionExpiryHandled,
            requestActive: clientIdRef.current === clientId
          });
          if (sessionExpiry) {
            sessionExpiryHandled = true;
            controller.abort();
            setZones([]);
            setLoading(false);
            setStatusMessage('');
            onSessionExpiredRef.current?.(sessionExpiry.message);
            return;
          }
          const unavailableWorkspaceId = getRequestUnavailableWorkspaceId({
            accessToken,
            error,
            handled: workspaceUnavailableHandled,
            requestActive:
              requestRevisionRef.current === revision &&
              clientIdRef.current === clientId &&
              Boolean(onWorkspaceUnavailableRef.current),
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
            onWorkspaceUnavailableRef.current?.(unavailableWorkspaceId);
            return;
          }
          failedRequestCount += 1;
        }
      });

      void Promise.allSettled(downloads).then(() => {
        if (controller.signal.aborted || requestRevisionRef.current !== revision) {
          return;
        }
        const nextZones = mergeRiskZonesById(...cachedZones, ...receivedZones);
        const allMissingRequestsFailed =
          failedRequestCount === missingRequests.length && successfulRequestCount === 0;
        const replacementReady = failedRequestCount === 0;
        setZones(resolveViewportRiskDisplayZones(
          retainedZones,
          allMissingRequestsFailed ? cachedResult : nextZones,
          replacementReady
        ));
        if (allMissingRequestsFailed) {
          setErrorMessage('Risk areas could not be updated. Move the map or retry.');
          setStatusMessage('');
        } else if (!replacementReady) {
          setErrorMessage('Some risk areas could not be updated. Retry when convenient.');
          setStatusMessage('');
        } else {
          setErrorMessage('');
          setStatusMessage(nextZones.length ? '' : 'No risk areas in this map view.');
        }
        setLoading(false);
      });
    }, VIEWPORT_RISK_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [accessToken, enabled, requestSignature, retryRevision]);

  return {
    errorMessage,
    loading,
    retry: () => setRetryRevision((revision) => revision + 1),
    statusMessage,
    zones
  };
}
