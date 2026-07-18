export async function waitForBoundedMaestroPhase({
  label,
  settled,
  stop,
  timeoutMs,
}) {
  let timeout;
  const result = await Promise.race([
    settled,
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    }),
  ]);
  clearTimeout(timeout);

  if (result?.timedOut) {
    await stop();
    throw new Error(
      `Maestro phase exceeded ${timeoutMs}ms and was stopped: ${label}`,
    );
  }
  if (result?.error) {
    throw new Error(
      `Maestro phase could not start: ${label}: ${result.error.message}`,
      { cause: result.error },
    );
  }
  if (result?.code !== 0) {
    throw new Error(
      `Maestro phase failed (${result?.code ?? result?.signal ?? "signal"}): ${label}`,
    );
  }
  return result;
}
