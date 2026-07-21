export function isBackgroundNavigationRuntimeSupported({
  executionEnvironment,
  platform,
}: {
  executionEnvironment: string;
  platform: string;
}): boolean {
  return platform !== "web" && executionEnvironment !== "storeClient";
}
