import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typeScale } from "../../theme";
import { uiTestIds } from "../../testing/uiTestIds";

export function NavigationCleanupNotice({
  checking,
  onRetry,
}: {
  checking: boolean;
  onRetry: () => void;
}) {
  const insets = useSafeAreaInsets();
  const message = checking
    ? "Removing saved guidance before another route can start."
    : "SafeRoute could not remove saved guidance. Retry before starting another route.";

  return (
    <View
      accessibilityLabel={`Guidance cleanup needed. ${message}`}
      accessibilityRole="alert"
      style={[styles.notice, { top: insets.top + spacing.xs }]}
      testID={uiTestIds.navigationCleanupNotice}
    >
      <Text style={styles.title}>Guidance cleanup needed</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        accessibilityLabel={checking ? "Removing saved guidance" : "Retry guidance cleanup"}
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
