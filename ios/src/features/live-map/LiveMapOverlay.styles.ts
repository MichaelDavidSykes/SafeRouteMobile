import { StyleSheet } from "react-native";

import { colors, radius, spacing, typeScale } from "../../theme";

export const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    pointerEvents: "box-none",
  },
  chromeEntrance: {
    ...StyleSheet.absoluteFillObject,
  },
  transientEntrance: {
    ...StyleSheet.absoluteFillObject,
  },
  routeStack: {
    ...StyleSheet.absoluteFillObject,
  },
  routeStackSuppressed: {
    opacity: 0,
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
    width: 46,
    maxWidth: 46,
    minWidth: 46,
    height: 46,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 0,
    borderWidth: 0.5,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  controlButtonCompact: {
    width: 46,
    maxWidth: 46,
    minWidth: 46,
    height: 46,
    minHeight: 46,
    paddingHorizontal: 0,
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
    maxWidth: "100%",
    flexShrink: 1,
    color: colors.ink,
    fontSize: typeScale.xs,
    fontWeight: "900",
    letterSpacing: 0,
    textAlign: "center",
  },
  controlButtonTextActive: {
    color: colors.onAccent,
  },
  controlButtonTextDisabled: {
    color: colors.mutedSoft,
  }
});
