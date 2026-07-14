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

  it('prepares map-first routes before Start-only guidance flows', () => {
    assert.doesNotMatch(
      read('package.json'),
      /SAFEROUTE_ENABLE_GUIDANCE_CONTRACT_FIXTURE/,
    );
    const workspacePreparation = read(
      'maestro/ios-guidance-contract-workspace-prepare.yaml'
    );
    assert.match(workspacePreparation, /id: "safe-route-login-primary-action"/);
    assert.match(workspacePreparation, /id: "guest-map-primary-action"/);
    assert.match(workspacePreparation, /id: "safe-route-card-guidance-contract-route"/);
    assert.match(workspacePreparation, /id: "safe-route-live-map"/);
    assert.doesNotMatch(workspacePreparation, /id: "safe-route-primary-action"/);

    for (const path of [
      'maestro/ios-guidance-contract-public-seed.yaml',
      'maestro/ios-guidance-contract-workspace-seed.yaml',
      'maestro/ios-guidance-contract-workspace-reseed.yaml',
      'maestro/ios-guidance-contract-wrong-principal-start.yaml',
      'maestro/ios-guidance-contract-denied-start.yaml'
    ]) {
      const commands = read(path)
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('appId:') && line !== '---');
      assert.deepEqual(commands.slice(0, 2), [
        '- tapOn:',
        '    id: "safe-route-primary-action"'
      ], `${path} must make Start its first command`);
    }
  });

  it('runs public, offline workspace, wrong-principal, denial, and regain phases', () => {
    const runner = read('scripts/run-maestro-guidance-contract.mjs');

    for (const phase of [
      'publicPrepare',
      'publicStart',
      'publicResume',
      'workspacePrepare',
      'workspaceStart',
      'workspaceOffline',
      'workspaceReconnect',
      'wrongPrincipalPrepare',
      'wrongPrincipalStart',
      'deniedPrepare',
      'deniedStart',
      'workspaceReseedPrepare',
      'workspaceReseed',
      'wrongPrincipal',
      'wrongPrincipalRelaunch',
      'denialSeed',
      'denied',
      'regained'
    ]) {
      assert.match(
        runner,
        new RegExp(`(?:runPhase\\(\\s*'${phase}'|phase: '${phase}')`)
      );
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

  it('records phase-bound ordered request evidence before reporting success', () => {
    const runner = read('scripts/run-maestro-guidance-contract.mjs');
    const fixture = read('scripts/maestro-guidance-contract-api.mjs');

    assert.match(runner, /const controlFile = join\(tempDirectory, 'control\.json'\)/);
    assert.match(runner, /'--control-file', controlFile/);
    assert.match(runner, /renameSync\(pendingControlFile, controlFile\)/);
    assert.match(runner, /function runPhase\(phase, label, file\) \{[\s\S]*setControl\(phase\)/);
    assert.match(
      runner,
      /assertRequestJournalIntegrity\(\);[\s\S]*SafeRoute cold guidance matrix passed/
    );
    assert.match(runner, /requiredPhases: \['wrongPrincipal', 'denied'\]/);
    assert.match(runner, /expectedModeByPhase/);
    assert.match(fixture, /authorizationClass: classifyAuthorization/);
    assert.match(fixture, /entry\.authorized === \(entry\.authorizationClass === 'expected-bearer'\)/);
    assert.match(fixture, /entry\.mode === expectedModeByPhase\[entry\.phase\]/);
    assert.match(fixture, /sequence: sequence \+ 1/);
    assert.match(fixture, /readExistingJournalLength\(requestLogFile\)/);
  });

  it('brackets fresh Start taps and asserts exact protected traffic', () => {
    const runner = read('scripts/run-maestro-guidance-contract.mjs');
    const fixture = read('scripts/maestro-guidance-contract-api.mjs');

    assert.match(runner, /waitForStartAuthorizationTrafficQuiet/);
    assert.match(runner, /writeStartBoundaryMarker\(boundary, 'open'\)/);
    assert.match(runner, /writeStartBoundaryMarker\(boundary, 'close'\)/);
    assert.match(runner, /assertGuidanceStartTrafficBoundary/);
    assert.match(
      runner,
      /boundary: 'public-start'[\s\S]*expectedPaths: \[\]/
    );
    assert.match(
      runner,
      /boundary: 'active-workspace-start'[\s\S]*'\/api\/v1\/users\/me'[\s\S]*'\/api\/v1\/mobile\/safe-route\/routes'/
    );
    assert.match(
      runner,
      /boundary: 'wrong-principal-start'[\s\S]*expectedPaths: \['\/api\/v1\/users\/me'\]/
    );
    assert.match(
      runner,
      /boundary: 'denied-workspace-start'[\s\S]*'\/api\/v1\/users\/me'[\s\S]*'\/api\/v1\/mobile\/safe-route\/routes'/
    );
    assert.match(fixture, /GUIDANCE_START_BOUNDARY_PATH/);
    assert.match(fixture, /entry\.search === ''/);
    assert.match(fixture, /entry\.authorizationClass === 'expected-bearer'/);

    const quietIndex = runner.indexOf('await waitForStartAuthorizationTrafficQuiet();');
    const openIndex = runner.indexOf("await writeStartBoundaryMarker(boundary, 'open');");
    const modeSwitchIndex = runner.indexOf('setControl(phase);', quietIndex);
    const outcomeIndex = runner.indexOf('runMaestroPhase(phase, `${label} outcome`, outcomeFile);');
    const outcomeQuietIndex = runner.indexOf(
      'await waitForStartAuthorizationTrafficQuiet();',
      outcomeIndex,
    );
    const closeIndex = runner.indexOf("await writeStartBoundaryMarker(boundary, 'close');");
    assert.ok(quietIndex >= 0 && openIndex > quietIndex);
    assert.ok(modeSwitchIndex > openIndex, 'Start mode must switch only after the open marker');
    assert.ok(outcomeIndex > modeSwitchIndex && outcomeQuietIndex > outcomeIndex);
    assert.ok(closeIndex > outcomeQuietIndex, 'Start boundary must close only after traffic is quiet');

    const deniedBoundary = runner.slice(
      runner.indexOf("boundary: 'denied-workspace-start'"),
      runner.indexOf("phase: 'deniedStart'")
    );
    assert.equal(
      (deniedBoundary.match(/'\/api\/v1\/users\/me'/g) || []).length,
      1
    );
    assert.equal(
      (deniedBoundary.match(/'\/api\/v1\/mobile\/safe-route\/routes'/g) || []).length,
      1
    );

    const deniedOutcome = read(
      'maestro/ios-guidance-contract-denied-start-outcome.yaml'
    );
    assert.match(deniedOutcome, /visible: "Refresh workspace access"/);
    assert.match(deniedOutcome, /assertNotVisible: "Refreshing workspace access"/);
  });

});
