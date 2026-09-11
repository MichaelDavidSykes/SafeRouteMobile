import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

describe("guest map held-point routing", () => {
  const source = readFileSync(
    join(process.cwd(), "src/features/guest-map/GuestMapScreen.tsx"),
    "utf8",
  );

  it("sets an unresolved destination before adding further held points as waypoints", () => {
    assert.match(source, /shouldUseGuestMapSelectionAsDestination\(routeDraft\)/);
    assert.match(source, /stopId:\s*routeDraft\.destination\.id,[\s\S]*type:\s*'stop\/select'/);
    assert.match(source, /mapSelectionSetsDestination \? 'Set destination' : 'Add stop'/);
    assert.match(source, /Destination set\. Plot the route when ready\./);
  });
});
