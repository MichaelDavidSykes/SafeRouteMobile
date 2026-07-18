export function isSessionRestoreAttemptCurrent(
  currentGeneration: number,
  attemptGeneration: number,
  mounted: boolean,
): boolean {
  return mounted && currentGeneration === attemptGeneration;
}

export function requireCurrentSessionRestoreAttempt(
  currentGeneration: number,
  attemptGeneration: number,
  mounted: boolean,
): void {
  if (
    !isSessionRestoreAttemptCurrent(
      currentGeneration,
      attemptGeneration,
      mounted,
    )
  ) {
    throw new Error('Saved-session restore attempt is stale.');
  }
}
