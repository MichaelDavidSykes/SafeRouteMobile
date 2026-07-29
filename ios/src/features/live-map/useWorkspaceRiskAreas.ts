import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Region } from 'react-native-maps';

import { getRequestSessionExpiry } from '../api/sessionExpiry';
import { getRequestUnavailableWorkspaceId } from '../workspaces/workspaceAccessRecovery';
import { fetchWorkspaceRiskAreas } from './workspaceRiskAreaApi';
import { selectWorkspaceRiskAreasForRegion } from './workspaceRiskAreaApiCore';
import type { RiskZone } from './liveMapTypes';
import { workspaceRiskPersistentCache } from './workspaceRiskPersistentCache';
import { normalizeViewportRiskCacheScopeId } from './viewportRiskPersistentCacheCore';

export function useWorkspaceRiskAreas({
  accessToken,
  cacheScopeId,
  clientId,
  enabled,
  onSessionExpired,
  onWorkspaceUnavailable,
  refreshEnabled,
  region
}: {
  accessToken?: string | null;
  cacheScopeId?: string | null;
  clientId?: string | null;
  enabled: boolean;
  onSessionExpired?: (message?: string) => void;
  onWorkspaceUnavailable?: (workspaceId: string) => void;
  refreshEnabled: boolean;
  region: Region;
}) {
  const requestRevisionRef = useRef(0);
  const accessSessionIdentityRef = useRef({
    identity: 0,
    token: String(accessToken || '').trim()
  });
  const onSessionExpiredRef = useRef(onSessionExpired);
  const onWorkspaceUnavailableRef = useRef(onWorkspaceUnavailable);
  const allZonesRef = useRef<RiskZone[]>([]);
  const loadedContextRef = useRef('');
  const [allZones, setAllZones] = useState<RiskZone[]>([]);
  const [loadedContext, setLoadedContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryRevision, setRetryRevision] = useState(0);
  const normalizedAccessToken = String(accessToken || '').trim();
  const normalizedClientId = String(clientId || '').trim();
  const normalizedCacheScopeId = normalizeViewportRiskCacheScopeId(
    cacheScopeId
  ) || (
    normalizedAccessToken && normalizedClientId
      ? `workspace:${normalizedClientId}`
      : 'guest'
  );
  if (accessSessionIdentityRef.current.token !== normalizedAccessToken) {
    accessSessionIdentityRef.current = {
      identity: accessSessionIdentityRef.current.identity + 1,
      token: normalizedAccessToken
    };
  }
  const requestContext = enabled && normalizedAccessToken && normalizedClientId
    ? `workspace:${normalizedClientId}:${normalizedCacheScopeId}:` +
      `session-${accessSessionIdentityRef.current.identity}`
    : '';
  allZonesRef.current = allZones;
  loadedContextRef.current = loadedContext;
  onSessionExpiredRef.current = onSessionExpired;
  onWorkspaceUnavailableRef.current = onWorkspaceUnavailable;

  useEffect(() => {
    const revision = requestRevisionRef.current + 1;
    requestRevisionRef.current = revision;
    const controller = new AbortController();
    const requestIsCurrent = () =>
      !controller.signal.aborted &&
      requestRevisionRef.current === revision;

    if (!requestContext) {
      allZonesRef.current = [];
      loadedContextRef.current = '';
      setAllZones([]);
      setLoadedContext('');
      setLoading(false);
      setErrorMessage('');
      return () => controller.abort();
    }

    if (loadedContext !== requestContext) {
      allZonesRef.current = [];
      loadedContextRef.current = '';
      setAllZones([]);
      setLoadedContext('');
    }
    setLoading(loadedContextRef.current !== requestContext);
    setErrorMessage('');
    let sessionExpiryHandled = false;
    let workspaceUnavailableHandled = false;
    let freshResponseAccepted = false;
    let refreshFailed = false;

    void workspaceRiskPersistentCache.load(
      normalizedCacheScopeId,
      normalizedClientId
    ).then((snapshot) => {
      if (!requestIsCurrent() || freshResponseAccepted) {
        return;
      }
      if (snapshot && loadedContextRef.current !== requestContext) {
        allZonesRef.current = snapshot.zones;
        loadedContextRef.current = requestContext;
        setAllZones(snapshot.zones);
        setLoadedContext(requestContext);
      }
      // Cached data can render immediately while refresh continues. Without a
      // cache, keep progress visible until the fresh request actually settles.
      if (snapshot || !refreshEnabled) {
        setLoading(false);
      }
      if (snapshot && refreshFailed) {
        setErrorMessage(
          'Shared workspace risk areas could not be refreshed. Last-confirmed markers remain visible.'
        );
      }
    });

    if (!refreshEnabled) {
      return () => controller.abort();
    }

    void fetchWorkspaceRiskAreas({
      accessToken: normalizedAccessToken,
      clientId: normalizedClientId,
      signal: controller.signal
    }).then((zones) => {
      if (!requestIsCurrent()) {
        return;
      }
      freshResponseAccepted = true;
      allZonesRef.current = zones;
      loadedContextRef.current = requestContext;
      setAllZones(zones);
      setLoadedContext(requestContext);
      setErrorMessage('');
      void workspaceRiskPersistentCache.save(
        normalizedCacheScopeId,
        normalizedClientId,
        zones
      ).catch(() => undefined);
    }).catch((error: unknown) => {
      if (!requestIsCurrent()) {
        return;
      }
      const sessionExpiry = getRequestSessionExpiry({
        authenticated: Boolean(onSessionExpiredRef.current),
        error,
        handled: sessionExpiryHandled,
        requestActive: true
      });
      if (sessionExpiry) {
        sessionExpiryHandled = true;
        freshResponseAccepted = true;
        allZonesRef.current = [];
        loadedContextRef.current = '';
        setAllZones([]);
        setLoadedContext('');
        onSessionExpiredRef.current?.(sessionExpiry.message);
        return;
      }
      const unavailableWorkspaceId = getRequestUnavailableWorkspaceId({
        accessToken: normalizedAccessToken,
        error,
        handled: workspaceUnavailableHandled,
        requestActive: Boolean(onWorkspaceUnavailableRef.current),
        workspaceId: normalizedClientId
      });
      if (unavailableWorkspaceId) {
        workspaceUnavailableHandled = true;
        freshResponseAccepted = true;
        allZonesRef.current = [];
        loadedContextRef.current = '';
        setAllZones([]);
        setLoadedContext('');
        void workspaceRiskPersistentCache.clear(
          normalizedCacheScopeId,
          normalizedClientId
        ).catch(() => undefined);
        onWorkspaceUnavailableRef.current?.(unavailableWorkspaceId);
        return;
      }
      refreshFailed = true;
      setErrorMessage(
        loadedContextRef.current === requestContext
          ? 'Shared workspace risk areas could not be refreshed. Last-confirmed markers remain visible.'
          : 'Shared workspace risk areas could not be loaded.'
      );
    }).finally(() => {
      if (requestIsCurrent()) {
        setLoading(false);
      }
    });

    return () => controller.abort();
  }, [
    normalizedAccessToken,
    normalizedCacheScopeId,
    normalizedClientId,
    refreshEnabled,
    requestContext,
    retryRevision
  ]);

  const zones = useMemo(
    () => loadedContext === requestContext
      ? selectWorkspaceRiskAreasForRegion(allZones, region)
      : [],
    [
      allZones,
      loadedContext,
      region.latitude,
      region.latitudeDelta,
      region.longitude,
      region.longitudeDelta,
      requestContext
    ]
  );
  const retry = useCallback(
    () => setRetryRevision((revision) => revision + 1),
    []
  );

  return {
    errorMessage,
    loading,
    retry,
    zones
  };
}
