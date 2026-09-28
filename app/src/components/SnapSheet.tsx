import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const SPRING = {
  damping: 28,
  stiffness: 260,
  mass: 0.8,
  overshootClamping: true,
} as const;

const ENTER_SPRING = {
  damping: 30,
  stiffness: 220,
  mass: 0.9,
  overshootClamping: true,
} as const;

const VELOCITY_SNAP = 700;

export function useSheetPresence(active: boolean) {
  const [mounted, setMounted] = useState(active);

  useEffect(() => {
    if (active) setMounted(true);
  }, [active]);

  const onExited = useCallback(() => {
    if (!active) setMounted(false);
  }, [active]);

  return { mounted: active || mounted, visible: active, onExited };
}

export type SnapSheetRender = {
  expanded: boolean;
  toggle: () => void;
};

type SnapSheetProps = {
  bottomOffset: number;
  maxHeight: number;
  onHeight?: (height: number) => void;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  header: ReactNode | ((ctx: SnapSheetRender) => ReactNode);
  children: ReactNode;
  absolute?: boolean;
  visible?: boolean;
  onExited?: () => void;
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
};

function snapHeight(
  expanded: boolean,
  headerHeight: number,
  bodyHeight: number,
  maxHeight: number,
  fill: boolean,
) {
  if (headerHeight <= 0) return 0;
  if (!expanded) return headerHeight;
  if (fill) return maxHeight;
  return Math.min(maxHeight, headerHeight + Math.max(bodyHeight, 0));
}

export function SnapSheet({
  bottomOffset,
  maxHeight,
  onHeight,
  expanded: expandedProp,
  defaultExpanded = true,
  onExpandedChange,
  header,
  children,
  absolute = true,
  visible = true,
  onExited,
  fill = false,
  style,
}: SnapSheetProps) {
  const [uncontrolledExpanded, setUncontrolledExpanded] = useState(defaultExpanded);
  const expanded = expandedProp ?? uncontrolledExpanded;
  const skipExpandedEffect = useRef(false);
  const armed = useRef(false);

  const [headerHeight, setHeaderHeight] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);

  const height = useSharedValue(0);
  const translateY = useSharedValue(1200);
  const dragStart = useSharedValue(0);
  const headerH = useSharedValue(0);
  const bodyH = useSharedValue(0);
  const maxH = useSharedValue(maxHeight);

  const expandedHeight = snapHeight(true, headerHeight, bodyHeight, maxHeight, fill);

  const setExpanded = useCallback(
    (next: boolean) => {
      if (expandedProp === undefined) setUncontrolledExpanded(next);
      onExpandedChange?.(next);
    },
    [expandedProp, onExpandedChange],
  );

  const toggle = useCallback(() => {
    setExpanded(!expanded);
  }, [expanded, setExpanded]);

  useEffect(() => {
    maxH.value = maxHeight;
    headerH.value = headerHeight;
    bodyH.value = bodyHeight;
  }, [maxHeight, headerHeight, bodyHeight, maxH, headerH, bodyH]);

  const notifyExited = useCallback(() => {
    onExited?.();
  }, [onExited]);

  const applySnap = useCallback(
    (next: boolean, velocity = 0) => {
      const target = snapHeight(next, headerHeight, bodyHeight, maxHeight, fill);
      if (target <= 0) return;
      if (next && !fill && bodyHeight <= 0) return;
      if (!armed.current) {
        height.value = target;
        translateY.value = target;
        armed.current = true;
        if (visible) {
          translateY.value = withSpring(0, ENTER_SPRING);
        } else {
          runOnJS(notifyExited)();
        }
        return;
      }
      height.value = withSpring(target, { ...SPRING, velocity });
    },
    [headerHeight, bodyHeight, maxHeight, fill, height, translateY, visible, notifyExited],
  );

  useEffect(() => {
    if (!armed.current) return;
    if (visible) {
      translateY.value = withSpring(0, ENTER_SPRING);
      return;
    }
    const hideTo = height.value > 0 ? height.value : 420;
    translateY.value = withSpring(hideTo, ENTER_SPRING, (finished) => {
      if (finished) runOnJS(notifyExited)();
    });
  }, [visible, notifyExited, height, translateY]);

  useEffect(() => {
    if (skipExpandedEffect.current) {
      skipExpandedEffect.current = false;
      return;
    }
    applySnap(expanded);
  }, [applySnap, expanded]);

  const commitExpanded = useCallback(
    (next: boolean) => {
      skipExpandedEffect.current = true;
      setExpanded(next);
    },
    [setExpanded],
  );

  const reportHeight = useCallback(
    (next: number) => {
      onHeight?.(next);
    },
    [onHeight],
  );

  useAnimatedReaction(
    () => Math.round(Math.max(0, height.value - translateY.value)),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(reportHeight)(current);
      }
    },
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-12, 12])
        .failOffsetX([-36, 36])
        .onStart(() => {
          dragStart.value = height.value;
        })
        .onUpdate((event) => {
          const minHeight = headerH.value;
          const maxSnap = fill ? maxH.value : Math.min(maxH.value, headerH.value + bodyH.value);
          if (minHeight <= 0 || maxSnap < minHeight) return;
          height.value = Math.min(maxSnap, Math.max(minHeight, dragStart.value - event.translationY));
        })
        .onEnd((event) => {
          const minHeight = headerH.value;
          const maxSnap = fill ? maxH.value : Math.min(maxH.value, headerH.value + bodyH.value);
          if (minHeight <= 0) return;
          const nextExpanded =
            event.velocityY < -VELOCITY_SNAP ||
            (event.velocityY <= VELOCITY_SNAP && height.value > (minHeight + maxSnap) / 2);
          height.value = withSpring(nextExpanded ? maxSnap : minHeight, {
            ...SPRING,
            velocity: -event.velocityY,
          });
          runOnJS(commitExpanded)(nextExpanded);
        }),
    [commitExpanded, dragStart, height, headerH, bodyH, maxH, fill],
  );

  const motionStyle = useAnimatedStyle(() => {
    const nextHeight = height.value;
    const offset = translateY.value;
    const travel = Math.max(nextHeight, 1);
    return {
      opacity: Math.max(0, 1 - offset / travel),
      transform: [{ translateY: offset }],
    };
  });

  const heightStyle = useAnimatedStyle(() => {
    if (height.value <= 0) return {};
    return { height: height.value };
  });

  const onHeaderLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.height);
    if (next > 0 && next !== headerHeight) setHeaderHeight(next);
  };

  const onBodySize = (_width: number, nextHeight: number) => {
    const next = Math.round(nextHeight);
    if (next > 0 && next !== bodyHeight) setBodyHeight(next);
  };

  const headerNode = typeof header === "function" ? header({ expanded, toggle }) : header;
  const canScroll = expanded && (fill || (expandedHeight >= maxHeight && bodyHeight > 0));

  return (
    <View
      pointerEvents={visible ? "box-none" : "none"}
      style={[
        absolute
          ? {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: bottomOffset,
              zIndex: 30,
            }
          : null,
        { maxHeight },
        style,
      ]}
    >
      <Animated.View style={[{ maxHeight, width: "100%" }, motionStyle]}>
        <View className="rounded-t-[28px] bg-white shadow-[0_-10px_30px_rgba(17,17,17,0.12)]">
        <Animated.View
          style={[
            { overflow: "hidden", borderTopLeftRadius: 28, borderTopRightRadius: 28 },
            heightStyle,
          ]}
        >
          <GestureDetector gesture={gesture}>
            <View onLayout={onHeaderLayout} className="px-5 pt-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={expanded ? "Recoger menú" : "Desplegar menú"}
                onPress={toggle}
                hitSlop={12}
                className="items-center pb-3"
              >
                <View className="h-1 w-9 rounded-sm bg-[#e0e0e5]" />
              </Pressable>
              {headerNode}
            </View>
          </GestureDetector>
          <ScrollView
            scrollEnabled={canScroll}
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets={fill}
            onContentSizeChange={onBodySize}
            style={canScroll ? { flex: 1 } : { flexGrow: 0 }}
            contentContainerClassName="px-5 pb-4 pt-4"
            contentContainerStyle={fill ? { flexGrow: 1 } : undefined}
            pointerEvents={expanded ? "auto" : "none"}
          >
            {children}
          </ScrollView>
        </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}
