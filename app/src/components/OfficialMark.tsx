import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Text, View } from "react-native";

const STAR = "#EB1D00";

/** Estrella llena si el lugar es oficial; solo el contorno si no lo es. */
export function OfficialMark({
  official,
  className,
}: {
  official: boolean | null;
  className?: string;
}) {
  if (official == null) return null;
  return (
    <View
      accessibilityLabel={official ? "Sitio oficial" : "Sitio no oficial"}
      className={`flex-row items-center ${className ?? ""}`}
    >
      <MaterialIcons name={official ? "star" : "star-border"} size={14} color={STAR} />
      <Text className="ml-1 font-sans text-[13px] text-[#6e6e73] dark:text-[#8b95a5]">
        {official ? "Oficial" : "No oficial"}
      </Text>
    </View>
  );
}
