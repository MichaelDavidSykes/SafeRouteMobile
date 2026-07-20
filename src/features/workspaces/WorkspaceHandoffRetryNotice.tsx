import type { Ref } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typeScale } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";
import { createWorkspaceHandoffRetryNoticeCopy } from "./workspaceHandoffRetryNoticeCopy";

export function WorkspaceHandoffRetryNotice({
  checkingAccess,
  onChooseAnother,
  onKeepCurrent,
  onRetry,
  retryActionRef,
  saving,
  sourceWorkspaceName,
  targetWorkspaceName,
}: {
  checkingAccess: boolean;
  onChooseAnother: () => void;
  onKeepCurrent: () => void;
  onRetry: () => void;
  retryActionRef?: Ref<View>;
  saving: boolean;
  sourceWorkspaceName?: string | null;
  targetWorkspaceName: string;
}) {
  const insets = useSafeAreaInsets();
  const busy = saving || checkingAccess;
  const copy = createWorkspaceHandoffRetryNoticeCopy({
    checkingAccess,
    saving,
    sourceWorkspaceName,
    targetWorkspaceName,
  });

  return (
    <View
      style={[styles.notice, { top: insets.top + spacing.xs }]}
      testID={uiTestIds.workspaceHandoffRetryNotice}
    >
      <View
        accessible
        accessibilityLabel={`${copy.title}. ${copy.accessibilityMessage}`}
        accessibilityLiveRegion={busy ? "polite" : "none"}
        accessibilityRole={busy ? "alert" : "summary"}
      >
        <Text numberOfLines={1} style={styles.title}>
          {copy.title}
        </Text>
        <Text ellipsizeMode="tail" numberOfLines={3} style={styles.message}>
          {copy.message}
        </Text>
      </View>
      <Pressable
        ref={retryActionRef}
        accessibilityLabel={copy.retryAccessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={onRetry}
        style={({ pressed }) => [
          styles.primaryAction,
          busy ? styles.actionDisabled : null,
          pressed && !busy ? styles.actionPressed : null,
        ]}
        testID={uiTestIds.workspaceHandoffRetryAction}
      >
        <Text numberOfLines={1} style={styles.primaryActionText}>
          {copy.retryLabel}
        </Text>
      </Pressable>
      {!saving ? (
        <>
          <Pressable
            accessibilityLabel={copy.chooseAnotherAccessibilityLabel}
            accessibilityRole="button"
            onPress={onChooseAnother}
            style={({ pressed }) => [
              styles.secondaryAction,
              pressed ? styles.actionPressed : null,
            ]}
            testID={uiTestIds.workspaceHandoffChooseAnotherAction}
          >
            <Text numberOfLines={1} style={styles.secondaryActionText}>
              {copy.chooseAnotherLabel}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={copy.keepAccessibilityLabel}
            accessibilityRole="button"
            onPress={onKeepCurrent}
            style={({ pressed }) => [
              styles.secondaryAction,
              pressed ? styles.actionPressed : null,
            ]}
            testID={uiTestIds.workspaceHandoffKeepCurrentAction}
          >
            <Text numberOfLines={1} style={styles.secondaryActionText}>
              {copy.keepLabel}
            </Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    zIndex: 120,
    alignSelf: "center",
    maxWidth: 440,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.28)",
    borderRadius: radius.lg,
    backgroundColor: "rgba(10, 18, 30, 0.96)",
  },
  title: {
    color: colors.surface,
    fontSize: typeScale.lg,
    fontWeight: "900",
  },
  message: {
    marginTop: spacing.xs,
    color: colors.controlStrong,
    fontSize: typeScale.sm,
    lineHeight: 18,
  },
  primaryAction: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
  },
  secondaryAction: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.42)",
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  primaryActionText: {
    color: colors.surface,
    fontSize: typeScale.sm,
    fontWeight: "900",
  },
  secondaryActionText: {
    color: colors.surface,
    fontSize: typeScale.sm,
    fontWeight: "800",
  },
});
