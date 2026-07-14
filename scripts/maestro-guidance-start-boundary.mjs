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
    if (
      now() - quietSince >= quietMs &&
      countUnfinishedProtectedRequests(readEntries(), isProtectedTraffic) === 0
    ) {
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
  expectedOutcomes,
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
      const protectedEntries = entries.filter(
        (entry) => entry.sequence > open.sequence && isProtectedTraffic(entry)
      );
      if (protectedEntries.length >= expectedCount) {
        if (!Array.isArray(expectedOutcomes)) {
          return;
        }
        const completed = protectedEntries.slice(0, expectedCount).every((request, index) => {
          const responseEntries = entries.filter(
            (entry) => entry.event === 'completion' && entry.requestId === request.requestId
          );
          if (responseEntries.length > 1) {
            throw new Error(
              `Guidance Start boundary ${boundary} recorded duplicate response outcomes.`
            );
          }
          if (responseEntries.length === 0) {
            return false;
          }
          const response = responseEntries[0];
          const expected = expectedOutcomes[index];
          if (
            !expected ||
            response.completed !== true ||
            response.statusCode !== expected.statusCode ||
            response.semanticOutcome !== expected.semanticOutcome
          ) {
            throw new Error(
              `Guidance Start boundary ${boundary} recorded an unexpected response outcome.`
            );
          }
          const nextRequest = protectedEntries[index + 1];
          if (nextRequest && response.sequence >= nextRequest.sequence) {
            throw new Error(
              `Guidance Start boundary ${boundary} issued authorization requests before the prior response completed.`
            );
          }
          return true;
        });
        if (completed) {
          return;
        }
      }
    }
    await sleep(pollMs);
  }

  throw new Error(
    `Guidance Start boundary ${boundary} did not record its expected authorization traffic within five seconds.`
  );
}

export function guidanceStartTrafficFingerprint(entries, isProtectedTraffic) {
  const protectedRequests = entries.filter(isProtectedTraffic);
  const protectedRequestIds = new Set(
    protectedRequests.map((entry) => entry.requestId).filter(Boolean)
  );
  return entries
    .filter(
      (entry) =>
        isProtectedTraffic(entry) ||
        (entry.event === 'completion' && protectedRequestIds.has(entry.requestId))
    )
    .map((entry) => entry.sequence)
    .join(',');
}

function countUnfinishedProtectedRequests(entries, isProtectedTraffic) {
  const completedRequestIds = new Set(
    entries
      .filter((entry) => entry.event === 'completion')
      .map((entry) => entry.requestId)
  );
  return entries.filter(
    (entry) =>
      isProtectedTraffic(entry) &&
      entry.requestId &&
      !completedRequestIds.has(entry.requestId)
  ).length;
}
