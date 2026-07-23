import type { Ref } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typeScale } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";
import { createWorkspaceHandoffRetryNoticeCopy } from "./workspaceHandoffRetryNoticeCopy";
import { MotionEntrance } from "../../motion/SafeRouteMotion";

export function WorkspaceHandoffRetryNotice({
  checkingAccess,
  onChooseAnother,
  onKeepCurrent,
  onRetry,
  retryActionRef,
  saving,
  sourceWorkspaceName,
  targetAccessRestored,
  targetWorkspaceName,
}: {
  checkingAccess: boolean;
  onChooseAnother: () => void;
  onKeepCurrent: () => void;
  onRetry: () => void;
  retryActionRef?: Ref<View>;
  saving: boolean;
  sourceWorkspaceName?: string | null;
  targetAccessRestored?: boolean;
  targetWorkspaceName: string;
}) {
  const insets = useSafeAreaInsets();
  const busy = saving || checkingAccess;
  const copy = createWorkspaceHandoffRetryNoticeCopy({
    checkingAccess,
    saving,
    sourceWorkspaceName,
    targetAccessRestored,
    targetWorkspaceName,
  });

  return (
    <MotionEntrance
      style={[styles.notice, { top: insets.top + spacing.xs }]}
      testID={uiTestIds.workspaceHandoffRetryNotice}
      variant="chrome"
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
    </MotionEntrance>
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
    borderColor: colors.borderSoft,
    borderRadius: radius.sheet,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.lg,
    fontWeight: "800",
  },
  message: {
    marginTop: spacing.xs,
    color: colors.muted,
    fontSize: typeScale.sm,
    lineHeight: 18,
  },
  primaryAction: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.appleBlue,
  },
  secondaryAction: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    borderWidth: 0,
    backgroundColor: colors.quiet,
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
    color: colors.inkSoft,
    fontSize: typeScale.sm,
    fontWeight: "800",
  },
});
