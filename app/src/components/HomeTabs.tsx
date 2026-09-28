import { Pressable, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

export type HomeTab = "map" | "tours" | "assistant";

const TAB_CONTENT_HEIGHT = 56;
const TAB_TOP_PADDING = 8;

const TABS: { id: HomeTab; label: string; icon: "map" | "route" | "auto-awesome" }[] = [
  { id: "map", label: "Mapa", icon: "map" },
  { id: "tours", label: "Recorridos", icon: "route" },
  { id: "assistant", label: "Asistente", icon: "auto-awesome" },
];

export function homeTabBarHeight(bottomInset: number) {
  return TAB_CONTENT_HEIGHT + TAB_TOP_PADDING + Math.max(bottomInset, 8);
}

type HomeTabsProps = {
  tab: HomeTab;
  onChange: (tab: HomeTab) => void;
  bottomInset: number;
};

export function HomeTabs({ tab, onChange, bottomInset }: HomeTabsProps) {
  return (
    <View
      className="absolute bottom-0 left-0 right-0 z-40 flex-row items-end border-t border-[#ebebef] bg-white"
      style={{
        height: homeTabBarHeight(bottomInset),
        paddingTop: TAB_TOP_PADDING,
        paddingBottom: Math.max(bottomInset, 8),
      }}
      accessibilityRole="tablist"
    >
      {TABS.map((item) => {
        const active = tab === item.id;
        const color = active ? "#111111" : "#969696";
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => onChange(item.id)}
            className="h-14 flex-1 items-center justify-center active:opacity-80"
          >
            <View
              className={`h-7 w-14 items-center justify-center rounded-xl`}
            >
              <MaterialIcons name={item.icon} size={22} color={color} />
            </View>
            <Text className="mt-0.5 text-[10px] font-medium" style={{ color }}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
