#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXPO_GO_BUNDLE_ID = "host.exp.Exponent";
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const sdkMajor = String(packageJson.dependencies?.expo || "").match(/\d+/)?.[0];

if (!sdkMajor) {
  console.error("Unable to determine the Expo SDK from package.json.");
  process.exit(1);
}

const booted = execFileSync(
  "xcrun",
  ["simctl", "list", "devices", "booted", "--json"],
  { encoding: "utf8" },
);
const hasBootedIosSimulator = Object.entries(JSON.parse(booted).devices || {})
  .some(([runtime, devices]) =>
    runtime.includes(".iOS-") && devices.some((device) => device.state === "Booted"),
  );
if (!hasBootedIosSimulator) {
  console.error("Boot an iOS simulator before repairing its Expo Go runtime.");
  process.exit(1);
}

const downloadDirectory = mkdtempSync(join(tmpdir(), "saferoute-expo-go-"));
try {
  console.log(`Downloading Expo Go for SDK ${sdkMajor}…`);
  const download = spawnSync(
    "npx",
    ["--yes", "expo-go@0.0.4", "download", "ios", sdkMajor],
    {
      cwd: downloadDirectory,
      stdio: "inherit",
      timeout: 5 * 60 * 1000,
    },
  );
  if (download.status !== 0) {
    process.exit(download.status || 1);
  }
  const appName = readdirSync(downloadDirectory).find((name) => name.endsWith(".app"));
  if (!appName) {
    console.error("The Expo Go download did not contain an iOS simulator app.");
    process.exit(1);
  }

  spawnSync("xcrun", ["simctl", "terminate", "booted", EXPO_GO_BUNDLE_ID], {
    stdio: "ignore",
  });
  spawnSync("xcrun", ["simctl", "uninstall", "booted", EXPO_GO_BUNDLE_ID], {
    stdio: "ignore",
  });
  execFileSync(
    "xcrun",
    ["simctl", "install", "booted", join(downloadDirectory, appName)],
    { stdio: "inherit" },
  );
  console.log(`Installed the SDK ${sdkMajor} Expo Go runtime on the booted simulator.`);
} finally {
  rmSync(downloadDirectory, { force: true, recursive: true });
}
