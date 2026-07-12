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

export const VIEWPORT_RISK_DEBOUNCE_MS = 140;
export const VIEWPORT_RISK_TIMEOUT_MS = 6000;

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

    const cachedResult = mergeRiskZonesById(...cachedZones);
    // Paint cached chunks immediately rather than holding the previous
    // viewport on screen while its replacement is downloaded.
    setZones(cachedResult);
    setLoading(true);
    setErrorMessage('');
    setStatusMessage('Loading risk areas…');
    const timer = setTimeout(() => {
      const receivedZones: RiskZone[][] = [];
      let failedRequestCount = 0;
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
          receivedZones.push(feed.zones);
          // Antimeridian views have two chunks. Reveal the first successful
          // chunk as soon as it lands instead of waiting for the slower one.
          setZones(mergeRiskZonesById(...cachedZones, ...receivedZones));
        } catch {
          if (!controller.signal.aborted) {
            failedRequestCount += 1;
          }
        }
      });

      void Promise.allSettled(downloads).then(() => {
        if (controller.signal.aborted || requestRevisionRef.current !== revision) {
          return;
        }

        const nextZones = mergeRiskZonesById(...cachedZones, ...receivedZones);
        setZones(nextZones);
        if (failedRequestCount === missingRequests.length && !cachedResult.length) {
          setErrorMessage('Risk areas could not be updated. Move the map or retry.');
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
  }, [accessToken, enabled, requests, retryRevision]);

  return {
    errorMessage,
    loading,
    retry: () => setRetryRevision((revision) => revision + 1),
    statusMessage,
    zones
  };
}
