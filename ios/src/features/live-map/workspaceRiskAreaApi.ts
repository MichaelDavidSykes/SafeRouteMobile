import { apiRequest } from '../api/apiClient';
import {
  buildWorkspaceRiskAreaPath,
  normalizeWorkspaceRiskAreas
} from './workspaceRiskAreaApiCore';
import type { RiskZone } from './liveMapTypes';

let requestSequence = 0;

export async function fetchWorkspaceRiskAreas({
  accessToken,
  clientId,
  signal
}: {
  accessToken: string;
  clientId: string;
  signal?: AbortSignal;
}): Promise<RiskZone[]> {
  const requestNonce = `${Date.now()}-${++requestSequence}`;
  const payload = await apiRequest<unknown>(
    buildWorkspaceRiskAreaPath(clientId, requestNonce),
    accessToken,
    {
      signal,
      timeoutMs: 9000
    }
  );
  return normalizeWorkspaceRiskAreas(payload, clientId);
}
