import Constants from 'expo-constants';

import {
  resolveSafeRouteExtraFromConstants,
  resolveSafeRouteRuntimeConfig,
  type SafeRouteConstantsLike
} from './envCore';

const extra = resolveSafeRouteExtraFromConstants(
  Constants as unknown as SafeRouteConstantsLike
);
const runtimeConfig = resolveSafeRouteRuntimeConfig(extra);

export const SAFEROUTE_DEMO_DRIVE_ENABLED = runtimeConfig.demoDriveEnabled;
export const SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED =
  runtimeConfig.connectivityContractEnabled;
export const SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED =
  runtimeConfig.storageFaultContractEnabled;
export const SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED =
  runtimeConfig.guidanceContractEvidenceEnabled;
export const SAFEROUTE_PREVIEW_MODE_ENABLED = runtimeConfig.previewModeEnabled;
export const SAFEROUTE_PREVIEW_INITIAL_SCREEN = runtimeConfig.previewInitialScreen;
export const LUNARCHAIN_API_BASE = runtimeConfig.lunarchainApiBase;
export const LUNARCHAIN_API_URL = runtimeConfig.lunarchainApiUrl;
export const SAFEROUTE_SOURCE_REVISION = runtimeConfig.sourceRevision;
