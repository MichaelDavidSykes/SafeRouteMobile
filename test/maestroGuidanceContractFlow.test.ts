import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Maestro cold guidance contract matrix', () => {
  it('uses valid reusable Expo launch configuration for every cold relaunch', () => {
    const subflow = read('maestro/subflows/ios-open-expo-project.yaml');

    assert.match(subflow, /^appId: host\.exp\.Exponent/m);
    assert.match(subflow, /^---$/m);
    assert.match(subflow, /openLink: exp:\/\/localhost:8081/);
    assert.match(subflow, /id: "saferoute-app-root"/);
  });

  it('follows map-first sign-in and waits for a simulator location fix before guidance', () => {
    assert.doesNotMatch(
      read('package.json'),
      /SAFEROUTE_ENABLE_GUIDANCE_CONTRACT_FIXTURE/,
    );
    for (const path of [
      'maestro/ios-guidance-contract-workspace-seed.yaml',
      'maestro/ios-guidance-contract-denial-seed.yaml'
    ]) {
      const flow = read(path);
      const loginIndex = flow.indexOf('id: "safe-route-login-primary-action"');
      const savedIndex = flow.indexOf('id: "guest-map-primary-action"', loginIndex);
      const startTapIndex = flow.indexOf('id: "safe-route-primary-action"', savedIndex);
      const liveFixIndex = flow.indexOf('latitude:', startTapIndex);
      const stopIndex = flow.indexOf('id: "safe-route-stop-action"', liveFixIndex);

      assert.ok(loginIndex >= 0, `${path} must submit login`);
      assert.ok(savedIndex > loginIndex, `${path} must reopen Saved from the signed-in map`);
      assert.ok(startTapIndex > savedIndex, `${path} must request guidance start`);
      assert.ok(liveFixIndex > startTapIndex, `${path} must deliver a fresh simulator location`);
      assert.ok(stopIndex > liveFixIndex, `${path} must verify guidance started`);
    }
  });

  it('runs public, offline workspace, wrong-principal, denial, and regain phases', () => {
    const runner = read('scripts/run-maestro-guidance-contract.mjs');

    for (const phase of [
      'publicSeed',
      'publicResume',
      'workspaceSeed',
      'workspaceOffline',
      'workspaceReconnect',
      'workspaceReseed',
      'wrongPrincipal',
      'wrongPrincipalRelaunch',
      'denialSeed',
      'denied',
      'regained'
    ]) {
      assert.match(runner, new RegExp(`runPhase\\([^\\n]+phases\\.${phase}\\)`));
    }
    assert.ok((runner.match(/await stopApi\(\)/g) || []).length >= 2);
    assert.match(runner, /Contract backend port remained bound during the workspace cold relaunch/);
    assert.match(
      runner,
      /reconnectUserCount = authorizedRequestCount\('\/api\/v1\/users\/me'\)[\s\S]*reconnectCatalogCount = requestCount\([\s\S]*'\/api\/v1\/mobile\/safe-route\/routes',[\s\S]*''[\s\S]*one fresh principal check and one unscoped catalog request/,
    );
    assert.match(runner, /without resurrecting denied guidance/);
  });

  it('accepts either immediate map cleanup or the preview return action after ending guidance', () => {
    for (const path of [
      'maestro/ios-guidance-contract-public-resume.yaml',
      'maestro/ios-guidance-contract-workspace-reconnect.yaml'
    ]) {
      const flow = read(path);
      assert.match(
        flow,
        /runFlow:[\s\S]*when:[\s\S]*id: "safe-route-return"[\s\S]*commands:[\s\S]*tapOn:[\s\S]*id: "safe-route-return"/,
      );
    }
  });
});
