import { StyleSheet } from "react-native";

import { colors, radius, spacing, typeScale } from "../../theme";

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.mapFallback,
  },
  overlay: {
    flex: 1,
    pointerEvents: "box-none",
  },
  mapControls: {
    position: "absolute",
    right: spacing.md,
    alignItems: "flex-end",
    gap: 8,
  },
  mapControlsCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  controlButton: {
    minWidth: 54,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceGlass,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  controlButtonCompact: {
    minWidth: 50,
    minHeight: 44,
    paddingHorizontal: spacing.xs,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  controlButtonActive: {
    borderColor: "rgba(255, 255, 255, 0.84)",
    backgroundColor: colors.appleBlue,
  },
  controlButtonDisabled: {
    opacity: 0.62,
  },
  controlButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  controlButtonText: {
    color: colors.ink,
    fontSize: typeScale.xs,
    fontWeight: "900",
    letterSpacing: 0.1,
  },
  controlButtonTextActive: {
    color: colors.surface,
  },
  controlButtonTextDisabled: {
    color: colors.mutedSoft,
  }
});
