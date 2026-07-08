import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveFirebaseIosDistributionReadiness } from '../src/config/firebaseDistributionReadiness';

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
        'release-notes-missing'
      ]
    );
    assert.equal(result.distributionCommand, null);
  });

  it('normalizes user-supplied project, app, tester, artifact, and notes values', () => {
    const result = resolveFirebaseIosDistributionReadiness({
      firebaseAuthenticated: true,
      firebaseCliAvailable: true,
      firebaseIosAppId: '  1:1234567890:ios:abcdef  ',
      firebaseProjectId: '  lunarchain-prod  ',
      iosArtifactExists: true,
      iosArtifactPath: '  /tmp/SafeRoute.ipa  ',
      releaseNotes: '  iOS smoke build  ',
      testerGroups: ['  ios-testers  ', 'ios-testers', '', null, 'dispatch-team']
    });

    assert.equal(result.ready, true);
    assert.deepEqual(result.normalized, {
      firebaseIosAppId: '1:1234567890:ios:abcdef',
      firebaseProjectId: 'lunarchain-prod',
      iosArtifactPath: '/tmp/SafeRoute.ipa',
      releaseNotes: 'iOS smoke build',
      testerGroups: ['ios-testers', 'dispatch-team']
    });
  });

  it('keeps distribution blocked when an artifact path exists but the file is missing', () => {
    const result = resolveFirebaseIosDistributionReadiness({
      firebaseAuthenticated: true,
      firebaseCliAvailable: true,
      firebaseIosAppId: '1:1234567890:ios:abcdef',
      firebaseProjectId: 'lunarchain-prod',
      iosArtifactExists: false,
      iosArtifactPath: '/tmp/SafeRoute.ipa',
      releaseNotes: 'Ready for iOS QA',
      testerGroups: ['ios-testers']
    });

    assert.equal(result.ready, false);
    assert.deepEqual(result.blockers.map((blocker) => blocker.code), ['ios-artifact-missing']);
  });

  it('returns a safe Firebase App Distribution command only when all inputs are ready', () => {
    const result = resolveFirebaseIosDistributionReadiness({
      firebaseAuthenticated: true,
      firebaseCliAvailable: true,
      firebaseIosAppId: '1:1234567890:ios:abcdef',
      firebaseProjectId: 'lunarchain-prod',
      iosArtifactExists: true,
      iosArtifactPath: "/tmp/SafeRoute tester's build.ipa",
      releaseNotes: "Pilot tester's smoke build",
      testerGroups: ['ios-testers']
    });

    assert.equal(result.ready, true);
    assert.equal(
      result.distributionCommand,
      "firebase appdistribution:distribute '/tmp/SafeRoute tester'\\''s build.ipa' --app '1:1234567890:ios:abcdef' --project 'lunarchain-prod' --groups 'ios-testers' --release-notes 'Pilot tester'\\''s smoke build'"
    );
  });
});
