import { Keyboard, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/Icon";
import { useMapPanel } from "@/map-panel";

export type HomeTab = "map" | "tours" | "assistant" | "profile";

const TAB_CONTENT_HEIGHT = 56;
const TAB_TOP_PADDING = 8;

const TABS: {
  id: HomeTab;
  label: string;
  icon: "map" | "route" | "auto-awesome" | "person";
}[] = [
  { id: "map", label: "Mapa", icon: "map" },
  { id: "tours", label: "Recorridos", icon: "route" },
  { id: "assistant", label: "Asistente", icon: "auto-awesome" },
  { id: "profile", label: "Perfil", icon: "person" },
];

export function homeTabBarHeight(bottomInset: number) {
  return TAB_CONTENT_HEIGHT + TAB_TOP_PADDING + Math.max(bottomInset, 8);
}

export function HomeTabs() {
  const insets = useSafeAreaInsets();
  const { panel, selectMapTab, profileOpen, setProfileOpen, placeDetails, closePlaceDetails } = useMapPanel();
  const tab: HomeTab = profileOpen ? "profile" : panel;

  const onChange = (next: HomeTab) => {
    Keyboard.dismiss();

    if (next === "profile") {
      setProfileOpen(!profileOpen);
      return;
    }

    if (placeDetails) closePlaceDetails();

    if (profileOpen) {
      setProfileOpen(false);
      if (next !== panel) {
        selectMapTab(next);
      }
      return;
    }

    selectMapTab(next);
  };

  return (
    <View
      className="flex-row items-end border-t border-[#ebebef] bg-white dark:border-[#1a212c] dark:bg-[#0d1219]"
      style={{
        height: homeTabBarHeight(insets.bottom),
        paddingTop: TAB_TOP_PADDING,
        paddingBottom: Math.max(insets.bottom, 8),
      }}
      accessibilityRole="tablist"
    >
      {TABS.map((item) => {
        const active = tab === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => onChange(item.id)}
            className="h-14 flex-1 items-center justify-center active:opacity-80"
          >
            <View className="h-7 w-14 items-center justify-center rounded-xl">
              <Icon
                name={item.icon}
                size={22}
                colorClassName={
                  active
                    ? "accent-[#111111] dark:accent-[#f2f4f7]"
                    : "accent-[#969696] dark:accent-[#6b7584]"
                }
              />
            </View>
            <Text
              className={`mt-0.5 text-[10px] font-medium ${
                active ? "text-[#111111] dark:text-[#f2f4f7]" : "text-[#969696] dark:text-[#6b7584]"
              }`}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
