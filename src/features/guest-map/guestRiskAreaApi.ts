import type { LatLng } from 'react-native-maps';

import { apiRequest } from '../api/apiClient';
import { buildGuestRiskAreaPayload } from './guestRiskAreaApiCore';

export const GUEST_RISK_AREA_ENDPOINT = '/convoy-routes/risk-markers';

export async function createGuestRiskArea({
  accessToken,
  clientId,
  coordinate,
  locationLabel,
  signal
}: {
  accessToken: string;
  clientId: string;
  coordinate: LatLng;
  locationLabel: string;
  signal?: AbortSignal;
}): Promise<void> {
  const payload = buildGuestRiskAreaPayload({ clientId, coordinate, locationLabel });
  await apiRequest(GUEST_RISK_AREA_ENDPOINT, accessToken, {
    body: JSON.stringify(payload),
    method: 'POST',
    signal,
    timeoutMs: 15_000
  });
}
