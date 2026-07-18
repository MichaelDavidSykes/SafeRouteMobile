import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { colors } from "../../theme";
import { routeListStyles as styles } from "./RouteListScreen.styles";
import {
  ROUTE_LIST_QUERY_INPUT_MAX_LENGTH,
  type RouteListClientFilterOption,
  type RouteListSummaryState,
} from "./routeListUiState";
import { uiTestIds } from "../../testing/uiTestIds";

const ROUTE_FILTER_HIT_SLOP = 6;

interface RouteListFiltersProps {
  clientFilterOptions: RouteListClientFilterOption[];
  query: string;
  routeSummary: RouteListSummaryState;
  showSummary: boolean;
  showClientFilters: boolean;
  showSearch: boolean;
  workspaceSwitchDisabled: boolean;
  workspaceAccessFocusTargetRef?: (target: View | null) => void;
  onChangeQuery: (query: string) => void;
  onSelectClient: (clientId: string | null) => void;
}

export function RouteListFilters({
  clientFilterOptions,
  onChangeQuery,
  onSelectClient,
  query,
  showClientFilters,
  showSearch,
  routeSummary,
  showSummary,
  workspaceSwitchDisabled,
  workspaceAccessFocusTargetRef,
}: RouteListFiltersProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const selectedClientOption =
    clientFilterOptions.find((option) => option.selected) || null;
  const workspaceLabel = selectedClientOption?.label || "Choose workspace";

  return (
    <>
      {showClientFilters ? (
        <View style={styles.clientFilter}>
          <Pressable
            ref={workspaceAccessFocusTargetRef}
            accessibilityHint={workspaceSwitchDisabled
              ? "End active guidance before changing workspace."
              : "Opens the active workspace menu."}
            accessibilityLabel={`Workspace, ${workspaceLabel}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: workspaceSwitchDisabled, expanded: clientMenuOpen }}
            disabled={workspaceSwitchDisabled}
            hitSlop={ROUTE_FILTER_HIT_SLOP}
            testID={uiTestIds.routeListWorkspaceSelector}
            style={({ pressed }) => [
              styles.clientSelectorButton,
              clientMenuOpen ? styles.clientSelectorButtonOpen : null,
              pressed ? styles.clientSelectorButtonPressed : null,
            ]}
            onPress={() => setClientMenuOpen((open) => !open)}
          >
            <View style={styles.clientSelectorCopy}>
              <Text numberOfLines={1} style={styles.clientSelectorLabel}>
                Workspace
              </Text>
              <Text numberOfLines={1} style={styles.clientSelectorValue}>
                {workspaceLabel}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.clientSelectorAction}>
              {workspaceSwitchDisabled ? "Route active" : clientMenuOpen ? "Close" : "Change"}
            </Text>
          </Pressable>

          {clientMenuOpen && !workspaceSwitchDisabled ? (
            <View style={styles.clientMenu}>
              <ScrollView
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.clientMenuContent}
              >
                {clientFilterOptions.map((option) => (
                  <ClientMenuItem
                    key={option.id || "all-clients"}
                    accessibilityHint={option.accessibilityHint}
                    accessibilityLabel={option.accessibilityLabel}
                    active={option.selected}
                    label={option.label}
                    testID={option.id ? uiTestIds.routeListWorkspaceOption(option.id) : undefined}
                    onPress={() => {
                      setClientMenuOpen(false);
                      onSelectClient(option.id);
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      ) : null}

      {showSearch ? (
        <View
          style={[
            styles.searchBox,
            searchFocused ? styles.searchBoxFocused : null,
          ]}
        >
          <TextInput
            accessibilityLabel="Search saved routes"
            accessibilityHint="Filters saved routes by route, convoy, endpoint, or risk."
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            maxLength={ROUTE_LIST_QUERY_INPUT_MAX_LENGTH}
            placeholder="Find route"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={styles.searchInput}
            value={query}
            onBlur={() => setSearchFocused(false)}
            onChangeText={onChangeQuery}
            onFocus={() => setSearchFocused(true)}
          />
        </View>
      ) : null}

      {showSummary ? (
        <View style={styles.listSummaryRow}>
          <Text
            accessibilityLabel={routeSummary.accessibilityLabel}
            numberOfLines={1}
            style={styles.listSummaryText}
          >
            {routeSummary.text}
          </Text>
          {routeSummary.clearSearchLabel ? (
            <Pressable
              accessibilityLabel={
                routeSummary.clearSearchAccessibilityLabel ||
                "Clear saved route search"
              }
              accessibilityRole="button"
              hitSlop={ROUTE_FILTER_HIT_SLOP}
              style={({ pressed }) => [
                styles.clearSearchButton,
                pressed ? styles.clearSearchButtonPressed : null,
              ]}
              onPress={() => onChangeQuery("")}
            >
              <Text numberOfLines={1} style={styles.clearSearchText}>
                {routeSummary.clearSearchLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function ClientMenuItem({
  accessibilityHint,
  accessibilityLabel,
  active,
  label,
  onPress,
  testID,
}: {
  accessibilityHint: string;
  accessibilityLabel: string;
  active: boolean;
  label: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      hitSlop={ROUTE_FILTER_HIT_SLOP}
      testID={testID}
      style={({ pressed }) => [
        styles.clientMenuItem,
        active ? styles.clientMenuItemActive : null,
        pressed ? styles.clientMenuItemPressed : null,
      ]}
      onPress={onPress}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.clientMenuItemText,
          active ? styles.clientMenuItemTextActive : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
