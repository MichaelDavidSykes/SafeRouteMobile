import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
  type BottomSheetProps,
} from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import {
  forwardRef,
  useCallback,
  type ComponentRef,
} from 'react';
import { StyleSheet, type ColorValue } from 'react-native';

import { colors, radius } from '../theme';

export type SafeRouteBottomSheetRef = ComponentRef<typeof BottomSheet>;

type SafeRouteBottomSheetProps = Omit<
  BottomSheetProps,
  | 'backdropComponent'
  | 'backgroundComponent'
  | 'backgroundStyle'
  | 'enableDynamicSizing'
  | 'enableOverDrag'
  | 'handleIndicatorStyle'
  | 'keyboardBehavior'
  | 'keyboardBlurBehavior'
> & {
  backdrop?: boolean;
  backdropAppearsOnIndex?: number;
  backdropDisappearsOnIndex?: number;
  backdropPressBehavior?: 'none' | 'close' | 'collapse' | number;
  dismissOnBackdropPress?: boolean;
  surfaceColor?: ColorValue;
};

export const SafeRouteBottomSheet = forwardRef<
  SafeRouteBottomSheetRef,
  SafeRouteBottomSheetProps
>(function SafeRouteBottomSheet(
  {
    accessible = false,
    backdrop = false,
    backdropAppearsOnIndex = 0,
    backdropDisappearsOnIndex = -1,
    backdropPressBehavior,
    dismissOnBackdropPress = false,
    children,
    style,
    surfaceColor = colors.sheet,
    ...props
  },
  ref,
) {
  const renderBackdrop = useCallback(
    (backdropProps: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...backdropProps}
        accessible={false}
        appearsOnIndex={backdropAppearsOnIndex}
        disappearsOnIndex={backdropDisappearsOnIndex}
        opacity={0.38}
        pressBehavior={
          backdropPressBehavior
            ?? (dismissOnBackdropPress ? 'close' : 'none')
        }
      />
    ),
    [
      backdropAppearsOnIndex,
      backdropDisappearsOnIndex,
      backdropPressBehavior,
      dismissOnBackdropPress,
    ],
  );

  return (
    <BottomSheet
      ref={ref}
      {...props}
      accessible={accessible}
      backdropComponent={backdrop ? renderBackdrop : undefined}
      backgroundComponent={SafeRouteBottomSheetBackground}
      backgroundStyle={[styles.background, { backgroundColor: surfaceColor }]}
      enableBlurKeyboardOnGesture
      enableDynamicSizing={false}
      enableOverDrag={false}
      handleIndicatorStyle={styles.handle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      style={[styles.sheet, style]}
    >
      {children}
    </BottomSheet>
  );
});

function SafeRouteBottomSheetBackground({
  pointerEvents,
  style,
}: BottomSheetBackgroundProps) {
  return (
    <BlurView
      accessibilityElementsHidden
      accessible={false}
      intensity={58}
      importantForAccessibility="no-hide-descendants"
      pointerEvents={pointerEvents}
      style={style}
      tint="dark"
    />
  );
}

const styles = StyleSheet.create({
  sheet: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.34,
    shadowRadius: 24,
    elevation: 18,
  },
  background: {
    overflow: 'hidden',
    backgroundColor: colors.sheet,
    borderColor: colors.glassBorder,
    borderCurve: 'continuous',
    borderRadius: radius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
  },
  handle: {
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    height: 5,
    width: 38,
  },
});
