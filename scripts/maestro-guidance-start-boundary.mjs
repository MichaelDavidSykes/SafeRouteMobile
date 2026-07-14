const defaultSleep = (delayMs) =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export async function waitForGuidanceStartTrafficQuiet({
  isProtectedTraffic,
  now = () => Date.now(),
  pollMs = 100,
  quietMs = 750,
  readEntries,
  sleep = defaultSleep,
  timeoutMs = 5000
}) {
  const deadline = now() + timeoutMs;
  let fingerprint = guidanceStartTrafficFingerprint(
    readEntries(),
    isProtectedTraffic
  );
  let quietSince = now();

  while (now() < deadline) {
    await sleep(pollMs);
    const nextFingerprint = guidanceStartTrafficFingerprint(
      readEntries(),
      isProtectedTraffic
    );
    if (nextFingerprint !== fingerprint) {
      fingerprint = nextFingerprint;
      quietSince = now();
      continue;
    }
    if (now() - quietSince >= quietMs) {
      return;
    }
  }

  throw new Error(
    'Guidance Start authorization traffic did not become quiet within five seconds.'
  );
}

export async function assertGuidanceStartTrafficRemainsQuiet({
  errorMessage = 'Guidance Start authorization traffic escaped its observation window.',
  isProtectedTraffic,
  now = () => Date.now(),
  observationMs,
  pollMs = 100,
  readEntries,
  sleep = defaultSleep
}) {
  const fingerprint = guidanceStartTrafficFingerprint(
    readEntries(),
    isProtectedTraffic
  );
  const deadline = now() + observationMs;

  while (now() < deadline) {
    await sleep(Math.min(pollMs, Math.max(1, deadline - now())));
    if (
      guidanceStartTrafficFingerprint(readEntries(), isProtectedTraffic) !==
      fingerprint
    ) {
      throw new Error(errorMessage);
    }
  }
}

export async function waitForGuidanceStartTraffic({
  boundary,
  boundaryPath,
  expectedCount,
  isProtectedTraffic,
  now = () => Date.now(),
  pollMs = 10,
  readEntries,
  sleep = defaultSleep,
  timeoutMs = 5000
}) {
  if (expectedCount === 0) {
    await sleep(250);
    return;
  }

  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const entries = readEntries();
    const open = entries.find((entry) => {
      if (entry.path !== boundaryPath) {
        return false;
      }
      const parameters = new URLSearchParams(entry.search);
      return (
        parameters.get('boundary') === boundary &&
        parameters.get('edge') === 'open'
      );
    });
    if (open) {
      const protectedCount = entries.filter(
        (entry) => entry.sequence > open.sequence && isProtectedTraffic(entry)
      ).length;
      if (protectedCount >= expectedCount) {
        return;
      }
    }
    await sleep(pollMs);
  }

  throw new Error(
    `Guidance Start boundary ${boundary} did not record its expected authorization traffic within five seconds.`
  );
}

export function guidanceStartTrafficFingerprint(entries, isProtectedTraffic) {
  return entries
    .filter(isProtectedTraffic)
    .map((entry) => entry.sequence)
    .join(',');
}
