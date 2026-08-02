import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  ArrowRight,
  Building2,
  Check,
  LogOut,
  RefreshCw,
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthBackdrop } from '../auth/AuthBackdrop';
import { MotionEntrance } from '../../motion/SafeRouteMotion';
import { uiTestIds } from '../../testing/uiTestIds';
import type { SafeRouteWorkspace } from './activeWorkspace';
import { workspaceSelectionStyles as styles } from './WorkspaceSelectionScreen.styles';

type WorkspaceSelectionScreenProps = {
  activeWorkspace: SafeRouteWorkspace | null;
  errorMessage: string;
  loading: boolean;
  onContinue: (workspace: SafeRouteWorkspace) => void;
  onRetry: () => void;
  onSignOut: () => void;
  saving: boolean;
  selectionFailed: boolean;
  userEmail: string;
  workspaces: SafeRouteWorkspace[];
};

export function WorkspaceSelectionScreen({
  activeWorkspace,
  errorMessage,
  loading,
  onContinue,
  onRetry,
  onSignOut,
  saving,
  selectionFailed,
  userEmail,
  workspaces,
}: WorkspaceSelectionScreenProps) {
  const viewport = useWindowDimensions();
  const compact = viewport.height < 760;
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');

  useEffect(() => {
    setSelectedWorkspaceId((currentId) => {
      if (workspaces.some((workspace) => workspace.id === currentId)) {
        return currentId;
      }
      return workspaces.some((workspace) => workspace.id === activeWorkspace?.id)
        ? activeWorkspace?.id || ''
        : '';
    });
  }, [activeWorkspace?.id, workspaces]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) || null,
    [selectedWorkspaceId, workspaces],
  );
  const busy = loading || saving;
  const continueDisabled = busy || !selectedWorkspace;
  const showEmptyState = !loading && workspaces.length === 0;
  const visibleError = errorMessage.trim();

  return (
    <View style={styles.screen} testID={uiTestIds.workspaceSelectionScreen}>
      <AuthBackdrop />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.topBar}>
          <View accessible accessibilityLabel="SafeRoute" style={styles.brand}>
            <Image
              accessibilityIgnoresInvertColors
              source={require('../../../assets/logo-mark-approved.png')}
              style={styles.logo}
            />
            <Text style={styles.brandName}>SafeRoute</Text>
          </View>
          <Pressable
            accessibilityHint="Signs out and returns to the public map."
            accessibilityLabel="Sign out"
            accessibilityRole="button"
            disabled={saving}
            hitSlop={6}
            testID={uiTestIds.workspaceSelectionSignOut}
            style={({ pressed }) => [
              styles.signOutButton,
              pressed ? styles.signOutButtonPressed : null,
            ]}
            onPress={onSignOut}
          >
            <LogOut color="#C9D9F2" size={17} strokeWidth={2.1} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>

        <ScrollView
          bounces={false}
          contentContainerStyle={[
            styles.scrollContent,
            compact ? styles.scrollContentCompact : null,
          ]}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <View style={styles.content}>
            <MotionEntrance variant="auth">
              <Text style={styles.eyebrow}>SIGNED IN</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Choose your workspace
              </Text>
              <Text style={styles.subtitle}>
                Your routes, risk areas, convoys and calendar will use the workspace you select.
              </Text>
              {userEmail.trim() ? (
                <Text numberOfLines={1} style={styles.accountLabel}>
                  {userEmail.trim()}
                </Text>
              ) : null}
            </MotionEntrance>

            <MotionEntrance
              delay={90}
              style={[
                styles.listSection,
                compact ? styles.listSectionCompact : null,
              ]}
              variant="auth"
            >
              <Text style={styles.sectionLabel}>Available workspaces</Text>

              {loading && workspaces.length === 0 ? (
                <View
                  accessibilityLabel="Loading workspaces"
                  accessibilityRole="progressbar"
                  style={styles.emptyState}
                  testID={uiTestIds.workspaceSelectionState}
                >
                  <ActivityIndicator color="#5CB0FF" size="small" />
                  <Text style={styles.emptyTitle}>Loading workspaces</Text>
                  <Text style={styles.emptyMessage}>
                    Checking the workspaces available to your account.
                  </Text>
                </View>
              ) : showEmptyState ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={styles.emptyState}
                  testID={uiTestIds.workspaceSelectionState}
                >
                  <View style={styles.emptyIcon}>
                    <Building2 color="#AEB3BF" size={24} strokeWidth={1.9} />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {visibleError ? 'Workspaces unavailable' : 'No workspaces available'}
                  </Text>
                  <Text style={styles.emptyMessage}>
                    {visibleError ||
                      'Your account does not currently have access to a SafeRoute workspace.'}
                  </Text>
                  <Pressable
                    accessibilityLabel="Retry loading workspaces"
                    accessibilityRole="button"
                    testID={uiTestIds.workspaceSelectionRetry}
                    style={({ pressed }) => [
                      styles.retryButton,
                      pressed ? styles.retryButtonPressed : null,
                    ]}
                    onPress={onRetry}
                  >
                    <RefreshCw color="#7CC0FF" size={17} strokeWidth={2.1} />
                    <Text style={styles.retryText}>Try again</Text>
                  </Pressable>
                </View>
              ) : (
                <View
                  accessibilityLabel="Available workspaces"
                  accessibilityRole="radiogroup"
                  style={styles.workspaceList}
                >
                  {workspaces.map((workspace, index) => {
                    const selected = workspace.id === selectedWorkspaceId;
                    return (
                      <MotionEntrance
                        key={workspace.id}
                        delay={Math.min(index * 38, 152)}
                        variant="list"
                      >
                        <Pressable
                          accessibilityHint={`Uses ${workspace.name} for SafeRoute.`}
                          accessibilityLabel={workspace.name}
                          accessibilityRole="radio"
                          accessibilityState={{ disabled: busy, selected }}
                          disabled={busy}
                          testID={uiTestIds.workspaceSelectionOption(workspace.id)}
                          style={({ pressed }) => [
                            styles.workspaceRow,
                            index === workspaces.length - 1
                              ? styles.workspaceRowLast
                              : null,
                            selected ? styles.workspaceRowSelected : null,
                            pressed ? styles.workspaceRowPressed : null,
                          ]}
                          onPress={() => setSelectedWorkspaceId(workspace.id)}
                        >
                          <View
                            style={[
                              styles.workspaceIcon,
                              selected ? styles.workspaceIconSelected : null,
                            ]}
                          >
                            <Building2
                              color={selected ? '#7CC0FF' : '#AEB3BF'}
                              size={21}
                              strokeWidth={2}
                            />
                          </View>
                          <View style={styles.workspaceCopy}>
                            <Text
                              numberOfLines={2}
                              style={[
                                styles.workspaceName,
                                selected ? styles.workspaceNameSelected : null,
                              ]}
                            >
                              {workspace.name}
                            </Text>
                            <Text numberOfLines={1} style={styles.workspaceHint}>
                              Routes, risk areas and operations
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.selectionControl,
                              selected ? styles.selectionControlSelected : null,
                            ]}
                          >
                            {selected ? (
                              <Check color="#FFFFFF" size={15} strokeWidth={2.8} />
                            ) : null}
                          </View>
                        </Pressable>
                      </MotionEntrance>
                    );
                  })}
                </View>
              )}

              {workspaces.length > 0 && (loading || visibleError || selectionFailed) ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={styles.statusRow}
                  testID={uiTestIds.workspaceSelectionState}
                >
                  {loading ? (
                    <ActivityIndicator color="#5CB0FF" size="small" />
                  ) : null}
                  <Text
                    style={[
                      styles.statusText,
                      visibleError || selectionFailed ? styles.errorText : null,
                    ]}
                  >
                    {loading
                      ? 'Checking workspace access…'
                      : visibleError || 'Workspace could not be selected. Try again.'}
                  </Text>
                </View>
              ) : null}
            </MotionEntrance>
          </View>
        </ScrollView>

        <MotionEntrance
          delay={150}
          style={[
            styles.footer,
            compact ? styles.footerCompact : null,
          ]}
          variant="auth"
        >
          <Pressable
            accessibilityHint={
              selectedWorkspace
                ? `Continues using ${selectedWorkspace.name}.`
                : 'Select a workspace first.'
            }
            accessibilityLabel={saving ? 'Saving workspace' : 'Continue'}
            accessibilityRole="button"
            accessibilityState={{ busy: saving, disabled: continueDisabled }}
            disabled={continueDisabled}
            testID={uiTestIds.workspaceSelectionContinue}
            style={({ pressed }) => [
              styles.continueButton,
              continueDisabled ? styles.continueButtonDisabled : null,
              pressed && !continueDisabled ? styles.continueButtonPressed : null,
            ]}
            onPress={() => {
              if (selectedWorkspace) {
                onContinue(selectedWorkspace);
              }
            }}
          >
            {saving ? <ActivityIndicator color="#12141A" size="small" /> : null}
            <Text style={styles.continueText}>
              {saving ? 'Saving workspace…' : 'Continue'}
            </Text>
            {!saving ? (
              <ArrowRight color="#12141A" size={19} strokeWidth={2.2} />
            ) : null}
          </Pressable>
        </MotionEntrance>
      </SafeAreaView>
    </View>
  );
}
