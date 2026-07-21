import { SAFEROUTE_PREVIEW_MODE_ENABLED } from "../../config/env";
import { apiRequest } from "../api/apiClient";
import { isPreviewAccessToken } from "../auth/previewSession";
import { loadOperationsState } from "./operationsApiCore";
import { loadPreviewOperationsState } from "./previewOperationsApi";
import type { SafeRouteOperationsState } from "./operationsTypes";

export async function fetchOperationsState(
  accessToken: string,
  clientId: string
): Promise<SafeRouteOperationsState> {
  if (SAFEROUTE_PREVIEW_MODE_ENABLED && isPreviewAccessToken(accessToken)) {
    return loadPreviewOperationsState(clientId);
  }

  return loadOperationsState(apiRequest, accessToken, clientId);
}
