const waitStartedAtMs = Date.now();
const requiredWaitMs = 2100;

while (Date.now() - waitStartedAtMs < requiredWaitMs) {
  // Keep Expo Go foregrounded inside this Maestro process while iOS advances
  // the timestamps used by production location and reroute confirmation.
}

output.elapsedMs = Date.now() - waitStartedAtMs;
