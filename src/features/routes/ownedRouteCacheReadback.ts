export async function recordOwnedRouteCacheReadback(
  ownsRequest: () => boolean,
  record: () => Promise<void>,
): Promise<boolean> {
  if (!ownsRequest()) {
    return false;
  }

  await record();
  return ownsRequest();
}
