import { useEffect, useState } from "react";
import {
  Bookmark,
  BusFront,
  CalendarDays,
  Map,
  Menu,
  X,
} from "lucide-react-native";
import { BlurView } from "expo-blur";
import Constants from "expo-constants";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  MotionEntrance,
  safeRouteMotion,
  useMotionValue,
} from "../motion/SafeRouteMotion";
import { chrome, colors, radius, spacing, typeScale } from "../theme";
import { uiTestIds } from "../testing/uiTestIds";
import {
  isAppTabDisabled,
  resolveAppNavigationMenuBottomInset,
  type AppTab,
} from "./appTabBarState";

export { isAppTabDisabled } from "./appTabBarState";
export type { AppTab } from "./appTabBarState";

type AppNavigationMenuProps = {
  activeTab: AppTab;
  authenticated: boolean;
  onSelect: (tab: AppTab) => void;
  placement?: "map" | "screen";
};

const tabs: Array<{ id: AppTab; label: string }> = [
  { id: "map", label: "Map" },
  { id: "routes", label: "Routes" },
  { id: "convoys", label: "Convoys" },
  { id: "calendar", label: "Calendar" },
];

const appVersion = Constants.expoConfig?.version ?? "0.1.0";
const installedBuild = Constants.platform?.ios?.buildNumber;
const buildLabel = __DEV__
  ? `v${appVersion} · Development`
  : `v${appVersion} · Build ${installedBuild ?? Constants.expoConfig?.ios?.buildNumber ?? "unknown"}`;

export function AppNavigationMenu({
  activeTab,
  authenticated,
  onSelect,
  placement = "screen",
}: AppNavigationMenuProps) {
  const safeAreaInsets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const menuProgress = useMotionValue(open ? 1 : 0, {
    duration: safeRouteMotion.disclosureDurationMs,
  });
  const bottom = placement === "map"
    ? chrome.screenBottomInset + 76 + spacing.sm
    : resolveAppNavigationMenuBottomInset(safeAreaInsets.bottom);

  useEffect(() => {
    setOpen(false);
  }, [activeTab, authenticated]);

  const animatedMenuStyle = {
    opacity: menuProgress,
    transform: [
      {
        translateX: menuProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
      {
        scale: menuProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1],
        }),
      },
    ],
  };

  return (
    <View
      pointerEvents="box-none"
      style={styles.overlay}
      testID={uiTestIds.appTabBar}
    >
      {open ? (
        <Pressable
          accessible={false}
          style={styles.backdrop}
          onPress={() => setOpen(false)}
        />
      ) : null}

      <View pointerEvents="box-none" style={[styles.dock, { bottom }]}>
        <Animated.View
          accessibilityElementsHidden={!open}
          accessibilityViewIsModal={open}
          importantForAccessibility={open ? "yes" : "no-hide-descendants"}
          pointerEvents={open ? "auto" : "none"}
          style={[styles.menuPosition, animatedMenuStyle]}
        >
          <BlurView intensity={64} style={styles.menuSurface} tint="dark">
            {tabs.map((tab) => {
              const selected = activeTab === tab.id;
              const disabled = isAppTabDisabled(tab.id, authenticated);

              return (
                <AppMenuItem
                  key={tab.id}
                  disabled={disabled}
                  label={tab.label}
                  selected={selected}
                  tab={tab.id}
                  onPress={() => {
                    setOpen(false);
                    onSelect(tab.id);
                  }}
                />
              );
            })}
            <Text selectable style={styles.buildLabel}>
              {buildLabel}
            </Text>
          </BlurView>
        </Animated.View>

        <MotionEntrance delay={placement === "map" ? 90 : 0} variant="control">
          <Pressable
            accessibilityHint={open
              ? "Closes the navigation options."
              : "Shows Map, Routes, Convoys, and Calendar."
            }
            accessibilityLabel={open ? "Close navigation menu" : "Open navigation menu"}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            hitSlop={6}
            style={({ pressed }) => [
              styles.trigger,
              open ? styles.triggerOpen : null,
              pressed ? styles.triggerPressed : null,
            ]}
            testID={uiTestIds.appNavigationMenuToggle}
            onPress={() => setOpen((current) => !current)}
          >
            <BlurView
              accessibilityElementsHidden
              intensity={58}
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              tint="dark"
            />
            {open ? (
              <X accessibilityElementsHidden color={colors.ink} size={21} strokeWidth={2.2} />
            ) : (
              <Menu accessibilityElementsHidden color={colors.appleBlue} size={22} strokeWidth={2.1} />
            )}
          </Pressable>
        </MotionEntrance>
      </View>
    </View>
  );
}

function AppMenuItem({
  disabled,
  label,
  onPress,
  selected,
  tab,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
  tab: AppTab;
}) {
  return (
    <Pressable
      accessibilityHint={disabled ? `Sign in to use ${label}.` : undefined}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      testID={uiTestIds.appTab(tab)}
      style={({ pressed }) => [
        styles.menuItem,
        selected ? styles.menuItemSelected : null,
        disabled ? styles.menuItemDisabled : null,
        pressed && !disabled ? styles.menuItemPressed : null,
      ]}
      onPress={onPress}
    >
      <TabGlyph disabled={disabled} selected={selected} tab={tab} />
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          selected ? styles.selectedLabel : null,
          disabled ? styles.disabledLabel : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function TabGlyph({
  disabled,
  selected,
  tab,
}: {
  disabled: boolean;
  selected: boolean;
  tab: AppTab;
}) {
  const color = disabled
    ? colors.mutedSoft
    : selected
      ? colors.appleBlue
      : colors.inkSoft;
  const iconProps = {
    color,
    size: 20,
    strokeWidth: selected ? 2.2 : 1.9,
  };

  if (tab === "map") {
    return <Map {...iconProps} accessibilityElementsHidden />;
  }

  if (tab === "routes") {
    return <Bookmark {...iconProps} accessibilityElementsHidden />;
  }

  if (tab === "convoys") {
    return <BusFront {...iconProps} accessibilityElementsHidden size={21} />;
  }

  return <CalendarDays {...iconProps} accessibilityElementsHidden />;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  dock: {
    position: "absolute",
    right: 14,
    width: 46,
    height: 46,
  },
  trigger: {
    width: 46,
    height: 46,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTranslucent,
    shadowColor: "#000000",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  triggerOpen: {
    borderColor: colors.appleBlue,
    backgroundColor: colors.surfaceGlass,
  },
  triggerPressed: {
    transform: [{ scale: 0.96 }],
  },
  menuPosition: {
    position: "absolute",
    right: 56,
    bottom: 0,
    width: 184,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  menuSurface: {
    gap: 2,
    padding: 6,
    backgroundColor: colors.surfaceTranslucent,
  },
  buildLabel: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 8,
  },
  menuItem: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
  },
  menuItemSelected: {
    backgroundColor: colors.appleBlueSoft,
  },
  menuItemPressed: {
    backgroundColor: colors.surfaceGlass,
  },
  menuItemDisabled: {
    opacity: 0.38,
  },
  label: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: typeScale.sm,
    fontWeight: "700",
  },
  selectedLabel: {
    color: colors.appleBlue,
  },
  disabledLabel: {
    color: colors.mutedSoft,
  },
});
