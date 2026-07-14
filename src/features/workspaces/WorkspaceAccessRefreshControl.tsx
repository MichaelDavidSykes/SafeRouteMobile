import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { uiTestIds } from "../../testing/uiTestIds";
import { colors, controlSizes, radius, spacing, typeScale } from "../../theme";
import {
  createWorkspaceAccessRefreshState,
  shouldStackWorkspaceAccessControl,
} from "./workspaceAccessRefreshState";

export function WorkspaceAccessRefreshControl({
  availableWorkspaceCount,
  loading,
  onRefresh,
}: {
  availableWorkspaceCount: number;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { fontScale, width } = useWindowDimensions();
  const state = createWorkspaceAccessRefreshState({ availableWorkspaceCount, loading });
  const stacked = shouldStackWorkspaceAccessControl({ fontScale, width });

  return (
    <Pressable
      accessible
      accessibilityHint={state.accessibilityHint}
      accessibilityLabel={state.accessibilityLabel}
      accessibilityLiveRegion="polite"
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      disabled={loading}
      testID={uiTestIds.workspaceAccessRefresh}
      style={({ pressed }) => [
        styles.control,
        stacked ? styles.controlStacked : null,
        pressed && !loading ? styles.controlPressed : null,
      ]}
      onPress={onRefresh}
    >
      <View style={[styles.copy, stacked ? styles.copyStacked : null]}>
        <Text style={styles.title}>{state.title}</Text>
        <Text style={styles.detail}>{state.detail}</Text>
      </View>
      <View style={[styles.status, stacked ? styles.statusStacked : null]}>
        {loading ? <ActivityIndicator color={colors.appleBlue} size="small" /> : null}
        <Text style={styles.action}>{state.actionLabel}</Text>
      </View>
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
  controlStacked: {
    alignItems: "stretch",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  controlPressed: {
    transform: [{ scale: 0.985 }],
  },
  copy: {
    minWidth: 0,
    flex: 1,
  },
  copyStacked: {
    width: "100%",
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
  status: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs,
  },
  statusStacked: {
    alignSelf: "flex-end",
  },
  action: {
    color: colors.appleBlue,
    fontSize: typeScale.xs,
    fontWeight: "900",
  },
});
