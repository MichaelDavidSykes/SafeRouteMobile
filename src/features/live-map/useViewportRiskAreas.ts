import { useEffect, useMemo, useRef, useState } from 'react';
import type { Region } from 'react-native-maps';

import { fetchAreaRiskViewport } from './areaRiskApi';
import {
  mergeRiskZonesById,
  regionToAreaRiskViewportRequests,
  type AreaRiskViewportRequest
} from './areaRiskApiCore';
import type { RiskZone } from './liveMapTypes';
import {
  cacheViewportRiskZones,
  getCachedViewportRiskZones,
  type ViewportRiskCache
} from './viewportRiskState';

const VIEWPORT_RISK_DEBOUNCE_MS = 280;

export function useViewportRiskAreas({
  accessToken,
  clientId,
  enabled = true,
  region
}: {
  accessToken?: string | null;
  clientId?: string | null;
  enabled?: boolean;
  region: Region;
}) {
  const cacheRef = useRef<ViewportRiskCache>(new Map());
  const requestRevisionRef = useRef(0);
  const [zones, setZones] = useState<RiskZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [retryRevision, setRetryRevision] = useState(0);
  const requests = useMemo(
    () => regionToAreaRiskViewportRequests(region, {
      clientId: clientId || undefined,
      detailMaxRecords: 120,
      regionalMaxRecords: 60
    }),
    [
      clientId,
      region.latitude,
      region.longitude,
      region.latitudeDelta,
      region.longitudeDelta
    ]
  );

  useEffect(() => {
    const revision = requestRevisionRef.current + 1;
    requestRevisionRef.current = revision;
    const controller = new AbortController();

    if (!enabled) {
      setLoading(false);
      setZones([]);
      setErrorMessage('');
      setStatusMessage('');
      return () => controller.abort();
    }

    if (!requests.length) {
      setLoading(false);
      setZones([]);
      setErrorMessage('');
      setStatusMessage('Zoom in to load risk areas.');
      return () => controller.abort();
    }

    const cachedZones: RiskZone[][] = [];
    const missingRequests: AreaRiskViewportRequest[] = [];
    for (const request of requests) {
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

    setLoading(true);
    setErrorMessage('');
    setStatusMessage('Loading risk areas…');
    const timer = setTimeout(() => {
      void Promise.all(missingRequests.map(async (request) => {
        const feed = await fetchAreaRiskViewport(request, {
          accessToken,
          signal: controller.signal,
          timeoutMs: 9000
        });
        cacheViewportRiskZones(cacheRef.current, request, feed.zones);
        return feed;
      })).then((feeds) => {
        if (controller.signal.aborted || requestRevisionRef.current !== revision) {
          return;
        }
        const nextZones = mergeRiskZonesById(
          ...cachedZones,
          ...feeds.map((feed) => feed.zones)
        );
        setZones(nextZones);
        setStatusMessage(nextZones.length ? '' : 'No risk areas in this map view.');
      }).catch(() => {
        if (controller.signal.aborted || requestRevisionRef.current !== revision) {
          return;
        }
        setZones(mergeRiskZonesById(...cachedZones));
        setErrorMessage('Risk areas could not be updated. Move the map or retry.');
        setStatusMessage('');
      }).finally(() => {
        if (!controller.signal.aborted && requestRevisionRef.current === revision) {
          setLoading(false);
        }
      });
    }, VIEWPORT_RISK_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [accessToken, enabled, requests, retryRevision]);

  return {
    errorMessage,
    loading,
    retry: () => setRetryRevision((revision) => revision + 1),
    statusMessage,
    zones
  };
}
