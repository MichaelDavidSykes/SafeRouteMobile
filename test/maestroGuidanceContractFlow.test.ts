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
    assert.match(workspacePreparation, /assertVisible:[\s\S]*id: "safe-route-primary-action"/);
    assert.doesNotMatch(
      workspacePreparation,
      /tapOn:[\s\S]{0,80}id: "safe-route-primary-action"/,
    );

    for (const path of [
      'maestro/ios-guidance-contract-public-seed.yaml',
      'maestro/ios-guidance-contract-workspace-seed.yaml',
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
      'reset',
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
      'workspaceReseedStart',
      'wrongPrincipal',
      'wrongPrincipalRelaunch',
      'denialSeedPrepare',
      'denialSeedStart',
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
    assert.match(runner, /const evidenceLogFile = join\(tempDirectory, 'evidence\.jsonl'\)/);
    assert.match(runner, /'--control-file', controlFile/);
    assert.match(runner, /'--evidence-log', evidenceLogFile/);
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
    assert.match(fixture, /response\.once\('finish'/);
    assert.match(fixture, /event: 'completion'/);
    assert.match(fixture, /semanticOutcome/);
    assert.match(runner, /await stopApi\(\);\s*assertRequestJournalIntegrity\(\);/);
    assert.match(
      runner,
      /assertRequestJournalIntegrity\(\);\s*assertEvidenceJournalIntegrity\(\);[\s\S]*Device evidence:/,
    );
    assert.match(runner, /minimumOccurredAtMs: evidenceWindowStartedAtMs/);
    for (const type of [
      'navigation.persisted',
      'restore.suspended',
      'restore.ready',
      'workspace.recovery.settled',
      'navigation.cleanup.settled',
      'tracking.stop.settled',
    ]) {
      assert.match(runner, new RegExp(`'${type.replace('.', '\\\.')}'`));
    }
    assert.match(runner, /kill\('SIGTERM'\)[\s\S]*kill\('SIGKILL'\)/);
    assert.match(runner, /waitForStartBoundaryMarkerOutcome/);
  });

  it('brackets fresh Start taps and asserts exact protected traffic', () => {
    const runner = read('scripts/run-maestro-guidance-contract.mjs');
    const fixture = read('scripts/maestro-guidance-contract-api.mjs');

    assert.match(runner, /waitForGuidanceStartTrafficQuiet/);
    assert.match(runner, /writeStartBoundaryMarker\(boundary, 'armed'\)/);
    assert.match(runner, /writeStartBoundaryMarker\(boundary, 'open'\)/);
    assert.match(runner, /writeStartBoundaryMarker\(boundary, 'close'\)/);
    assert.match(runner, /writeStartBoundaryMarker\(boundary, 'settled'\)/);
    assert.match(runner, /assertGuidanceStartTrafficRemainsQuiet/);
    assert.match(runner, /assertGuidanceStartTrafficBoundary/);
    assert.match(
      runner,
      /completedStartBoundaries\.push[\s\S]*function assertRequestJournalIntegrity[\s\S]*for \(const boundary of completedStartBoundaries\)[\s\S]*assertGuidanceStartTrafficBoundary\(entries, boundary\)/,
    );
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
    assert.match(
      runner,
      /boundary: 'workspace-reseed-start'[\s\S]*'\/api\/v1\/users\/me'[\s\S]*'\/api\/v1\/mobile\/safe-route\/routes'/
    );
    assert.match(
      runner,
      /boundary: 'denial-seed-start'[\s\S]*'\/api\/v1\/users\/me'[\s\S]*'\/api\/v1\/mobile\/safe-route\/routes'/
    );
    assert.match(fixture, /GUIDANCE_START_BOUNDARY_PATH/);
    assert.match(fixture, /entry\.search === ''/);
    assert.match(fixture, /entry\.authorizationClass === 'expected-bearer'/);
    assert.match(runner, /expectedOutcomes/);
    assert.match(
      runner,
      /boundary: 'wrong-principal-start'[\s\S]*semanticOutcome: 'principal-b'[\s\S]*statusCode: 200/
    );
    assert.match(
      runner,
      /boundary: 'denied-workspace-start'[\s\S]*semanticOutcome: 'catalog-denied'[\s\S]*statusCode: 200/
    );
    assert.match(
      runner,
      /waitForGuidanceStartTraffic\([\s\S]*expectedOutcomes/
    );
    assert.match(
      runner,
      /function requestCount[\s\S]*entry\.event === 'request'/
    );

    const quietIndex = runner.indexOf('await waitForGuidanceStartTrafficQuiet({');
    const armedIndex = runner.indexOf("await writeStartBoundaryMarker(boundary, 'armed');");
    const openIndex = runner.indexOf("await writeStartBoundaryMarker(boundary, 'open');");
    const modeSwitchIndex = runner.indexOf('setControl(phase);', quietIndex);
    const outcomeIndex = runner.indexOf('runMaestroPhase(phase, `${label} outcome`, outcomeFile);');
    const outcomeQuietIndex = runner.indexOf(
      'await waitForGuidanceStartTrafficQuiet({',
      outcomeIndex,
    );
    const closeIndex = runner.indexOf("await writeStartBoundaryMarker(boundary, 'close');");
    const quarantineIndex = runner.indexOf(
      'await assertGuidanceStartTrafficRemainsQuiet({',
      closeIndex,
    );
    const settledIndex = runner.indexOf("await writeStartBoundaryMarker(boundary, 'settled');");
    assert.ok(quietIndex >= 0 && armedIndex > quietIndex && openIndex > armedIndex);
    assert.ok(modeSwitchIndex > openIndex, 'Start mode must switch only after the open marker');
    assert.ok(outcomeIndex > modeSwitchIndex && outcomeQuietIndex > outcomeIndex);
    assert.ok(closeIndex > outcomeQuietIndex, 'Start boundary must close only after traffic is quiet');
    assert.ok(
      quarantineIndex > closeIndex && settledIndex > quarantineIndex,
      'Start boundary must remain quarantined before it settles',
    );
    assert.match(
      runner,
      /Public preparation did not exercise the contract route-preview endpoint\.'[\s\S]*boundary: 'public-start'/,
    );

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
    assert.match(
      deniedOutcome,
      /This route closed because its workspace is no longer available\./,
    );
    assert.match(
      read('maestro/ios-guidance-contract-wrong-principal-start-outcome.yaml'),
      /Workspace access belongs to another signed-in account\. Sign in again\./,
    );
    for (const path of [
      'maestro/ios-guidance-contract-public-start-outcome.yaml',
      'maestro/ios-guidance-contract-workspace-start-outcome.yaml',
      'maestro/ios-guidance-contract-workspace-reseed-start-outcome.yaml',
      'maestro/ios-guidance-contract-denial-seed-start-outcome.yaml'
    ]) {
      assert.match(read(path), /id: "safe-route-remaining-metrics"/);
    }
  });

});
