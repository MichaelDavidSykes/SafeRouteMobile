import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveFirebaseIosDistributionReadiness } from '../src/config/firebaseDistributionReadiness';

const readyReleaseInputs = {
  appEnvironment: 'production',
  firebaseAuthenticated: true,
  firebaseCliAvailable: true,
  firebaseIosAppId: '1:1234567890:ios:abcdef',
  firebaseProjectId: 'lunarchain-prod',
  googleMapsIosApiKey: 'ios-key',
  iosArtifactExists: true,
  iosArtifactPath: '/tmp/SafeRoute.ipa',
  iosBuildNumber: '56',
  productionApiUrl: 'https://api.lunarchain.net',
  releaseNotes: 'Ready for iOS QA',
  testerGroups: ['ios-testers']
};

describe('Firebase iOS distribution readiness', () => {
  it('lists every blocker for an unknown local release environment', () => {
    const result = resolveFirebaseIosDistributionReadiness({});

    assert.equal(result.ready, false);
    assert.deepEqual(
      result.blockers.map((blocker) => blocker.code),
      [
        'firebase-cli-missing',
        'firebase-auth-missing',
        'firebase-project-missing',
        'firebase-ios-app-id-missing',
        'ios-artifact-missing',
        'tester-groups-missing',
        'release-notes-missing',
        'production-env-missing',
        'production-api-url-missing',
        'google-maps-ios-key-missing',
        'ios-build-number-missing'
      ]
    );
    assert.equal(result.distributionCommand, null);
  });

  it('normalizes user-supplied project, app, tester, artifact, and release values', () => {
    const result = resolveFirebaseIosDistributionReadiness({
      appEnvironment: '  PRODUCTION  ',
      firebaseAuthenticated: true,
      firebaseCliAvailable: true,
      firebaseIosAppId: '  1:1234567890:ios:abcdef  ',
      firebaseProjectId: '  lunarchain-prod  ',
      googleMapsIosApiKey: '  ios-key  ',
      iosArtifactExists: true,
      iosArtifactPath: '  /tmp/SafeRoute.ipa  ',
      iosBuildNumber: '  56.1  ',
      productionApiUrl: '  https://api.lunarchain.net/  ',
      releaseNotes: '  iOS smoke build  ',
      testerGroups: ['  ios-testers  ', 'ios-testers', '', null, 'dispatch-team']
    });

    assert.equal(result.ready, true);
    assert.deepEqual(result.normalized, {
      appEnvironment: 'production',
      firebaseIosAppId: '1:1234567890:ios:abcdef',
      firebaseProjectId: 'lunarchain-prod',
      googleMapsIosApiKeyConfigured: true,
      iosArtifactPath: '/tmp/SafeRoute.ipa',
      iosBuildNumber: '56.1',
      productionApiUrl: 'https://api.lunarchain.net',
      releaseNotes: 'iOS smoke build',
      testerGroups: ['ios-testers', 'dispatch-team']
    });
  });

  it('keeps distribution blocked when an artifact path exists but the file is missing', () => {
    const result = resolveFirebaseIosDistributionReadiness({
      ...readyReleaseInputs,
      iosArtifactExists: false
    });

    assert.equal(result.ready, false);
    assert.deepEqual(result.blockers.map((blocker) => blocker.code), ['ios-artifact-missing']);
  });

  it('blocks non-production, insecure, or invalid iOS release inputs', () => {
    const result = resolveFirebaseIosDistributionReadiness({
      ...readyReleaseInputs,
      appEnvironment: 'staging',
      googleMapsIosApiKey: ' ',
      iosBuildNumber: '2026.07.08.1',
      productionApiUrl: 'http://api.lunarchain.net'
    });

    assert.equal(result.ready, false);
    assert.deepEqual(result.blockers.map((blocker) => blocker.code), [
      'production-env-missing',
      'production-api-url-insecure',
      'google-maps-ios-key-missing',
      'ios-build-number-invalid'
    ]);
    assert.equal(result.distributionCommand, null);
  });

  it('returns a safe Firebase App Distribution command only when all inputs are ready', () => {
    const result = resolveFirebaseIosDistributionReadiness({
      ...readyReleaseInputs,
      iosArtifactPath: "/tmp/SafeRoute tester's build.ipa",
      releaseNotes: "Pilot tester's smoke build"
    });

    assert.equal(result.ready, true);
    assert.equal(
      result.distributionCommand,
      "firebase appdistribution:distribute '/tmp/SafeRoute tester'\\''s build.ipa' --app '1:1234567890:ios:abcdef' --project 'lunarchain-prod' --groups 'ios-testers' --release-notes 'Pilot tester'\\''s smoke build'"
    );
  });
});
