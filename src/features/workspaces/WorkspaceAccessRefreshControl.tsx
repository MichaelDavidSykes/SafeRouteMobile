import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { uiTestIds } from "../../testing/uiTestIds";
import { colors, controlSizes, radius, spacing, typeScale } from "../../theme";

export function WorkspaceAccessRefreshControl({
  loading,
  onRefresh,
}: {
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <Pressable
      accessibilityHint="Checks whether an administrator restored workspace membership."
      accessibilityLabel={loading ? "Refreshing workspace access" : "Refresh workspace access"}
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      disabled={loading}
      testID={uiTestIds.workspaceAccessRefresh}
      style={({ pressed }) => [
        styles.control,
        pressed && !loading ? styles.controlPressed : null,
      ]}
      onPress={onRefresh}
    >
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.title}>Workspace access changed</Text>
        <Text numberOfLines={1} style={styles.detail}>Check for restored access</Text>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.appleBlue} size="small" />
      ) : (
        <Text numberOfLines={1} style={styles.action}>Refresh</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: {
    minHeight: controlSizes.secondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 0.5,
    borderColor: colors.borderSoft,
    borderRadius: radius.lg,
    backgroundColor: colors.appleBlueSoft,
  },
  controlPressed: {
    transform: [{ scale: 0.985 }],
  },
  copy: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.sm,
    fontWeight: "800",
    lineHeight: 18,
  },
  detail: {
    color: colors.muted,
    fontSize: typeScale.xs,
    fontWeight: "600",
    lineHeight: 15,
  },
  action: {
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "900",
  },
});
