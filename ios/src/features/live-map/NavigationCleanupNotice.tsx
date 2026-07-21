import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typeScale } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";
import { createNavigationCleanupNoticeCopy } from "./navigationCleanupNoticeCopy";

export function NavigationCleanupNotice({
  checking,
  onRetry,
  workspaceName,
}: {
  checking: boolean;
  onRetry: () => void;
  workspaceName?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const { accessibilityMessage, actionAccessibilityLabel, message } =
    createNavigationCleanupNoticeCopy({ checking, workspaceName });

  return (
    <View
      accessibilityLabel={`Guidance cleanup needed. ${accessibilityMessage}`}
      accessibilityRole="alert"
      style={[styles.notice, { top: insets.top + spacing.xs }]}
      testID={uiTestIds.navigationCleanupNotice}
    >
      <Text numberOfLines={1} style={styles.title}>
        Guidance cleanup needed
      </Text>
      <Text ellipsizeMode="tail" numberOfLines={3} style={styles.message}>
        {message}
      </Text>
      <Pressable
        accessibilityLabel={actionAccessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ busy: checking, disabled: checking }}
        disabled={checking}
        onPress={onRetry}
        style={({ pressed }) => [
          styles.action,
          checking ? styles.actionDisabled : null,
          pressed && !checking ? styles.actionPressed : null,
        ]}
        testID={uiTestIds.navigationCleanupRetry}
      >
        <Text style={styles.actionText}>{checking ? "Removing…" : "Retry cleanup"}</Text>
      </Pressable>
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
  action: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.appleBlue,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  actionText: {
    color: colors.surface,
    fontSize: typeScale.sm,
    fontWeight: "900",
  },
});
