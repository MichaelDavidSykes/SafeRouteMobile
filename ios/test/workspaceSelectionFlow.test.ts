import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const app = readFileSync('App.tsx', 'utf8');
const screen = readFileSync(
  'src/features/workspaces/WorkspaceSelectionScreen.tsx',
  'utf8',
);
const styles = readFileSync(
  'src/features/workspaces/WorkspaceSelectionScreen.styles.ts',
  'utf8',
);
const flow = readFileSync('maestro/ios-preview-workspace-choice.yaml', 'utf8');

describe('workspace selection screen flow', () => {
  it('places deliberate workspace choice between fresh authentication and the app', () => {
    assert.match(
      app,
      /handleAuthenticated[\s\S]*setWorkspaceSelectionFlowActive\(!restoringMatchingWorkspaceNavigation\)/,
    );
    assert.match(
      app,
      /workspaceSelectionFlowVisible[\s\S]*<WorkspaceSelectionScreen/,
    );
    assert.match(
      app,
      /workspaceSelectionFlowVisible[\s\S]*!workspaceSelectionFlowVisible[\s\S]*screen !== 'login'/,
    );
    assert.match(
      app,
      /handleWorkspaceSelectionFlowContinue[\s\S]*handleActiveWorkspaceChange\(target\)/,
    );
    assert.match(
      app,
      /activeWorkspace\?\.id !== targetId[\s\S]*setWorkspaceSelectionFlowActive\(false\)/,
    );
    assert.match(
      app,
      /storedSessionAvailableForRetry = Boolean\(storedSession\);[\s\S]*if \(SAFEROUTE_PREVIEW_MODE_ENABLED\)[\s\S]*enablePreviewSession\(\)/,
    );
  });

  it('requires a visible selection and explicit Continue action', () => {
    assert.match(screen, /Choose your workspace/);
    assert.match(screen, /Available workspaces/);
    assert.match(screen, /accessibilityRole="radiogroup"/);
    assert.match(screen, /accessibilityRole="radio"/);
    assert.match(screen, /continueDisabled = busy \|\| !selectedWorkspace/);
    assert.match(screen, /uiTestIds\.workspaceSelectionContinue/);
    assert.match(screen, /onContinue\(selectedWorkspace\)/);
    assert.match(screen, /saving \? 'Saving workspace…' : 'Continue'/);
    assert.match(styles, /continueButton:[\s\S]*minHeight:\s*54/);
    assert.match(styles, /workspaceRow:[\s\S]*minHeight:\s*76/);
  });

  it('keeps loading, retry, no-access, and sign-out paths on the same screen', () => {
    assert.match(screen, /Loading workspaces/);
    assert.match(screen, /Workspaces unavailable/);
    assert.match(screen, /No workspaces available/);
    assert.match(screen, /uiTestIds\.workspaceSelectionRetry/);
    assert.match(screen, /uiTestIds\.workspaceSelectionSignOut/);
    assert.match(screen, /onPress=\{onRetry\}/);
    assert.match(screen, /onPress=\{onSignOut\}/);
  });

  it('drives the dedicated flow in the iOS workspace preview', () => {
    assert.match(flow, /id: "safe-route-workspace-selection"/);
    assert.match(flow, /id: "safe-route-workspace-selection-preview-west"/);
    assert.match(flow, /id: "safe-route-workspace-selection-continue"/);
    assert.match(flow, /assertNotVisible:[\s\S]*safe-route-workspace-selection/);
    assert.match(flow, /Workspace, West Corridor/);
  });
});
