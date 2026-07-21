import { Bookmark, BusFront, CalendarDays, Map } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { chrome, colors, typeScale } from "../theme";
import { uiTestIds } from "../testing/uiTestIds";

export type AppTab = "map" | "routes" | "convoys" | "calendar";

type AppTabBarProps = {
  activeTab: AppTab;
  onSelect: (tab: AppTab) => void;
};

const tabs: Array<{ id: AppTab; label: string }> = [
  { id: "map", label: "Map" },
  { id: "routes", label: "Routes" },
  { id: "convoys", label: "Convoys" },
  { id: "calendar", label: "Calendar" },
];

export function AppTabBar({
  activeTab,
  onSelect,
}: AppTabBarProps) {
  return (
    <View testID={uiTestIds.appTabBar} style={styles.bar}>
      {tabs.map((tab) => {
        const selected = activeTab === tab.id;
        return (
          <Pressable
            key={tab.id}
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            hitSlop={4}
            testID={uiTestIds.appTab(tab.id)}
            style={({ pressed }) => [
              styles.item,
              pressed ? styles.itemPressed : null,
            ]}
            onPress={() => onSelect(tab.id)}
          >
            <TabGlyph selected={selected} tab={tab.id} />
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                selected ? styles.selected : null,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabGlyph({
  selected,
  tab,
}: {
  selected: boolean;
  tab: AppTab;
}) {
  const color = selected ? colors.appleBlue : colors.muted;
  const iconProps = {
    color,
    size: 23,
    strokeWidth: selected ? 2.2 : 1.9,
  };

  if (tab === "map") {
    return <Map {...iconProps} accessibilityElementsHidden />;
  }

  if (tab === "routes") {
    return <Bookmark {...iconProps} accessibilityElementsHidden />;
  }

  if (tab === "convoys") {
    return <BusFront {...iconProps} accessibilityElementsHidden size={24} />;
  }

  return <CalendarDays {...iconProps} accessibilityElementsHidden />;
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    height: chrome.tabBarHeight,
    flexDirection: "row",
    alignItems: "flex-start",
    paddingTop: 8,
    paddingBottom: chrome.tabBarBottomInset,
    borderTopWidth: 0.5,
    borderTopColor: colors.borderSoft,
    backgroundColor: "rgba(250, 250, 252, 0.94)",
  },
  item: {
    flex: 1,
    height: chrome.tabBarContentHeight - 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  itemPressed: {
    opacity: 0.58,
  },
  label: {
    color: colors.muted,
    fontSize: typeScale.xs - 1,
    fontWeight: "600",
    lineHeight: 12,
    textAlign: "center",
  },
  selected: {
    color: colors.appleBlue,
  },
});
