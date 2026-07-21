import type { Region } from 'react-native-maps';

import type { GuestLocationSearchResult } from './guestLocationSearch';
import {
  findGuestRouteDraftStop,
  getGuestRouteDraftUnresolvedStopIds,
  selectGuestRouteDraftLocation,
  type GuestRouteDraft
} from './guestRouteDraft';

export type GuestRouteDraftLocationSearch = (
  query: string,
  options: {
    bias?: {
      center?: { latitude: number; longitude: number } | null;
      region?: Region | null;
    };
    signal?: AbortSignal;
  }
) => Promise<GuestLocationSearchResult[]>;

export async function resolveGuestRouteDraftSearchInputs({
  bias,
  draft,
  search,
  signal
}: {
  bias?: Parameters<GuestRouteDraftLocationSearch>[1]['bias'];
  draft: GuestRouteDraft;
  search: GuestRouteDraftLocationSearch;
  signal?: AbortSignal;
}): Promise<GuestRouteDraft> {
  const unresolvedStops = getGuestRouteDraftUnresolvedStopIds(draft)
    .map((stopId) => ({ stopId, stop: findGuestRouteDraftStop(draft, stopId) }))
    .filter(({ stop }) => Boolean(
      stop?.label.trim() && stop.resolution.type === 'unresolved'
    ));
  const selections = await Promise.all(unresolvedStops.map(async ({ stopId, stop }) => ({
    selection: (await search(stop?.label.trim() || '', { bias, signal }))[0],
    stopId
  })));

  if (signal?.aborted) {
    return draft;
  }

  return selections.reduce((resolvedDraft, { selection, stopId }) => {
    if (!selection) {
      return resolvedDraft;
    }
    return selectGuestRouteDraftLocation(resolvedDraft, stopId, {
      coordinate: selection.coordinate,
      label: selection.displayName
    });
  }, draft);
}
