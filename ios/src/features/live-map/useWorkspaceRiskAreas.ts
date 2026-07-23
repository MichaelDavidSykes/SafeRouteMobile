import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Region } from 'react-native-maps';

import { getRequestSessionExpiry } from '../api/sessionExpiry';
import { getRequestUnavailableWorkspaceId } from '../workspaces/workspaceAccessRecovery';
import { fetchWorkspaceRiskAreas } from './workspaceRiskAreaApi';
import { selectWorkspaceRiskAreasForRegion } from './workspaceRiskAreaApiCore';
import type { RiskZone } from './liveMapTypes';

export function useWorkspaceRiskAreas({
  accessToken,
  clientId,
  enabled,
  onSessionExpired,
  onWorkspaceUnavailable,
  region
}: {
  accessToken?: string | null;
  clientId?: string | null;
  enabled: boolean;
  onSessionExpired?: (message?: string) => void;
  onWorkspaceUnavailable?: (workspaceId: string) => void;
  region: Region;
}) {
  const requestRevisionRef = useRef(0);
  const accessSessionIdentityRef = useRef({
    identity: 0,
    token: String(accessToken || '').trim()
  });
  const onSessionExpiredRef = useRef(onSessionExpired);
  const onWorkspaceUnavailableRef = useRef(onWorkspaceUnavailable);
  const [allZones, setAllZones] = useState<RiskZone[]>([]);
  const [loadedContext, setLoadedContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryRevision, setRetryRevision] = useState(0);
  const normalizedAccessToken = String(accessToken || '').trim();
  const normalizedClientId = String(clientId || '').trim();
  if (accessSessionIdentityRef.current.token !== normalizedAccessToken) {
    accessSessionIdentityRef.current = {
      identity: accessSessionIdentityRef.current.identity + 1,
      token: normalizedAccessToken
    };
  }
  const requestContext = enabled && normalizedAccessToken && normalizedClientId
    ? `workspace:${normalizedClientId}:session-${accessSessionIdentityRef.current.identity}`
    : '';
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
      setAllZones([]);
      setLoadedContext('');
      setLoading(false);
      setErrorMessage('');
      return () => controller.abort();
    }

    if (loadedContext !== requestContext) {
      setAllZones([]);
      setLoadedContext('');
    }
    setLoading(true);
    setErrorMessage('');
    let sessionExpiryHandled = false;
    let workspaceUnavailableHandled = false;

    void fetchWorkspaceRiskAreas({
      accessToken: normalizedAccessToken,
      clientId: normalizedClientId,
      signal: controller.signal
    }).then((zones) => {
      if (!requestIsCurrent()) {
        return;
      }
      setAllZones(zones);
      setLoadedContext(requestContext);
      setErrorMessage('');
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
        setAllZones([]);
        setLoadedContext('');
        onWorkspaceUnavailableRef.current?.(unavailableWorkspaceId);
        return;
      }
      setErrorMessage(
        allZones.length && loadedContext === requestContext
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
    normalizedClientId,
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
