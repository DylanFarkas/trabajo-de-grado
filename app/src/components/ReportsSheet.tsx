import { Pressable, Text, View } from "react-native";

import {
  CLOSURE_STATUS_LABEL,
  categoryLabel,
  timeAgo,
  type ActiveClosure,
} from "@/closures";
import { Icon } from "@/components/Icon";
import { MyReports } from "@/components/MyReports";
import { SnapSheet } from "@/components/SnapSheet";

type ReportsSheetProps = {
  bottomOffset: number;
  maxHeight: number;
  onHeight?: (height: number) => void;
  visible?: boolean;
  onExited?: () => void;
  signedIn: boolean;
  userId: string | null;
  closures: ActiveClosure[];
  onCreateRoadClosure: () => void;
  onOpenClosure: (closureId: number) => void;
  onSignIn: () => void;
};

/**
 * Tipos de reporte que acepta la app. Hoy solo existe el cierre de vías;
 * un tipo nuevo se suma a esta lista (con su flujo) sin tocar la pestaña.
 */
const REPORT_TYPES: {
  id: string;
  title: string;
  description: string;
  hint: string;
  icon: "block";
  available: boolean;
}[] = [
  {
    id: "road-closure",
    title: "Vía cerrada",
    description: "Un sendero, pasillo o vía del campus está bloqueado por una obra, un evento, una inundación o un daño.",
    hint: "Eliges los tramos tocándolos en el mapa",
    icon: "block",
    available: true,
  },
];

const STEPS = ["Elige los tramos en el mapa", "Describe qué pasa", "Quienes pasen cerca lo confirman"];

const STATUS_TONE: Record<ActiveClosure["status"], { chip: string; label: string }> = {
  candidate: {
    chip: "bg-[#f2f2f4] dark:bg-[#232c3a]",
    label: "text-[#3a3a3c] dark:text-[#c5ccd6]",
  },
  provisional: {
    chip: "bg-[#fff7e6] dark:bg-[#2a2213]",
    label: "text-[#9a5b00] dark:text-[#f5c46b]",
  },
  confirmed: {
    chip: "bg-[#fdecec] dark:bg-[#2a1517]",
    label: "text-[#b42318] dark:text-[#ff9b93]",
  },
};

function ActiveClosureRow({
  closure,
  onPress,
}: {
  closure: ActiveClosure;
  onPress: () => void;
}) {
  const tone = STATUS_TONE[closure.status];
  const segments =
    closure.segmentKeys.length === 1 ? "1 tramo" : `${closure.segmentKeys.length} tramos`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver cierre: ${categoryLabel(closure.category)}, ${closure.description}`}
      onPress={onPress}
      className="mb-2.5 flex-row items-center rounded-[20px] bg-[#f7f7f8] p-3.5 active:opacity-80 dark:bg-[#18202a]"
    >
      <View className="size-10 items-center justify-center rounded-full bg-[#fdecec] dark:bg-[#2a1517]">
        <Icon name="block" size={19} colorClassName="accent-[#b42318] dark:accent-[#ff9b93]" />
      </View>
      <View className="ml-3 min-w-0 flex-1">
        <Text
          className="font-sans text-[14px] leading-5 text-[#111111] dark:text-[#f2f4f7]"
          numberOfLines={2}
        >
          {closure.description}
        </Text>
        <Text className="mt-1 font-sans text-[12px] text-[#8e8e93] dark:text-[#8b95a5]" numberOfLines={1}>
          {categoryLabel(closure.category)} · {segments} · {timeAgo(closure.createdAt)}
          {closure.source === "admin" ? " · Universidad" : ""}
        </Text>
      </View>
      <View className={`ml-2 rounded-full px-2 py-1 ${tone.chip}`}>
        <Text className={`text-[10px] font-bold uppercase tracking-wide ${tone.label}`}>
          {CLOSURE_STATUS_LABEL[closure.status]}
        </Text>
      </View>
    </Pressable>
  );
}

export function ReportsSheet({
  bottomOffset,
  maxHeight,
  onHeight,
  visible,
  onExited,
  signedIn,
  userId,
  closures,
  onCreateRoadClosure,
  onOpenClosure,
  onSignIn,
}: ReportsSheetProps) {
  return (
    <SnapSheet
      bottomOffset={bottomOffset}
      maxHeight={maxHeight}
      onHeight={onHeight}
      visible={visible}
      onExited={onExited}
      header={({ expanded, toggle }) => (
        <View className="flex-row items-start">
          <Pressable accessible={false} onPress={toggle} className="min-w-0 flex-1 pr-3 active:opacity-70">
            <Text className="text-[22px] font-extrabold tracking-tight text-[#111111] dark:text-[#f2f4f7]">
              Reportes
            </Text>
            <Text className="mt-1 mb-3 font-sans text-sm text-[#8e8e93] dark:text-[#8b95a5]">
              Ayuda a que el mapa refleje cómo está el campus hoy
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? "Minimizar reportes" : "Mostrar reportes"}
            onPress={toggle}
            hitSlop={6}
            className="ml-2 size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80 dark:bg-[#1f2632]"
          >
            <Icon
              name={expanded ? "expand-more" : "expand-less"}
              size={20}
              colorClassName="accent-[#3a3a3c] dark:accent-[#c5ccd6]"
            />
          </Pressable>
        </View>
      )}
    >
      {!signedIn ? (
        <View className="mb-5 flex-row items-center rounded-[20px] bg-[#f5f5f7] p-3.5 dark:bg-[#18202a]">
          <View className="size-10 items-center justify-center rounded-full bg-white dark:bg-[#232c3a]">
            <Icon name="lock-outline" size={19} colorClassName="accent-[#3a3a3c] dark:accent-[#c5ccd6]" />
          </View>
          <View className="ml-3 min-w-0 flex-1">
            <Text className="text-[14px] font-bold text-[#111111] dark:text-[#f2f4f7]">
              Necesitas una cuenta para reportar
            </Text>
            <Text className="mt-0.5 font-sans text-[12px] leading-4 text-[#6e6e73] dark:text-[#8b95a5]">
              Así la comunidad sabe quién avisa y puedes seguir tus reportes.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Iniciar sesión"
            onPress={onSignIn}
            className="ml-2 h-10 items-center justify-center rounded-full bg-[#111111] px-4 active:opacity-80 dark:bg-[#f2f4f7]"
          >
            <Text className="text-[13px] font-bold text-white dark:text-[#0b0f16]">Entrar</Text>
          </Pressable>
        </View>
      ) : null}

      <Text className="mb-2.5 text-[13px] font-semibold text-[#8e8e93] dark:text-[#8b95a5]">
        ¿Qué quieres reportar?
      </Text>

      {REPORT_TYPES.map((type) => (
        <View
          key={type.id}
          className="rounded-[22px] border border-[rgba(180,35,24,0.14)] bg-[#fff7f5] p-4 dark:border-[rgba(255,155,147,0.16)] dark:bg-[#221417]"
        >
          <View className="flex-row items-start">
            <View className="size-11 items-center justify-center rounded-2xl bg-[#fdecec] dark:bg-[#2a1517]">
              <Icon name={type.icon} size={22} colorClassName="accent-[#b42318] dark:accent-[#ff9b93]" />
            </View>
            <View className="ml-3 min-w-0 flex-1">
              <Text className="text-[16px] font-bold text-[#111111] dark:text-[#f2f4f7]">{type.title}</Text>
              <Text className="mt-1 font-sans text-[13px] leading-5 text-[#6e6e73] dark:text-[#8b95a5]">
                {type.description}
              </Text>
            </View>
          </View>

          <View className="mt-4">
            {STEPS.map((step, index) => (
              <View key={step} className="flex-row items-center py-1">
                <View className="size-5.5 items-center justify-center rounded-full bg-[#111111] dark:bg-[#f2f4f7]">
                  <Text className="text-[11px] font-extrabold text-white dark:text-[#0b0f16]">{index + 1}</Text>
                </View>
                <Text className="ml-2.5 font-sans text-[13px] text-[#3a3a3c] dark:text-[#c5ccd6]">{step}</Text>
              </View>
            ))}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reportar vía cerrada: elegir tramos en el mapa"
            disabled={!type.available}
            onPress={onCreateRoadClosure}
            className="mt-4 h-12 flex-row items-center justify-center rounded-2xl bg-[#b42318] active:opacity-80 dark:bg-[#d92d20]"
          >
            <Icon name="add-location-alt" size={19} colorClassName="accent-white" />
            <Text className="ml-2 text-[15px] font-bold text-white">Elegir tramo en el mapa</Text>
          </Pressable>
          <Text className="mt-2 text-center font-sans text-[11px] text-[#8e8e93] dark:text-[#8b95a5]">
            {type.hint} · Sin aprobación previa
          </Text>
        </View>
      ))}

      <View className="mb-2.5 mt-7 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold tracking-tight text-[#111111] dark:text-[#f2f4f7]">
          Vías cerradas ahora
        </Text>
        {closures.length > 0 ? (
          <View className="rounded-full bg-[#f2f2f4] px-2 py-0.5 dark:bg-[#232c3a]">
            <Text className="text-[11px] font-bold text-[#3a3a3c] dark:text-[#c5ccd6]">{closures.length}</Text>
          </View>
        ) : null}
      </View>

      {closures.length === 0 ? (
        <View className="items-center rounded-[20px] bg-[#f7f7f9] px-6 py-6 dark:bg-[#18202a]">
          <View className="size-11 items-center justify-center rounded-full bg-white dark:bg-[#232c3a]">
            <Icon name="check-circle-outline" size={22} colorClassName="accent-[#1f8a4c] dark:accent-[#6fce8f]" />
          </View>
          <Text className="mt-3 text-center text-[14px] font-bold text-[#111111] dark:text-[#f2f4f7]">
            Ninguna vía reportada como cerrada
          </Text>
          <Text className="mt-1 text-center font-sans text-[12px] leading-4 text-[#6e6e73] dark:text-[#8b95a5]">
            Si encuentras un camino bloqueado, avisa arriba para que las rutas lo rodeen.
          </Text>
        </View>
      ) : (
        <View>
          {closures.map((closure) => (
            <ActiveClosureRow
              key={closure.id}
              closure={closure}
              onPress={() => onOpenClosure(closure.id)}
            />
          ))}
          <Text className="font-sans text-[11px] leading-4 text-[#8e8e93] dark:text-[#8b95a5]">
            Toca un cierre para ver su detalle y confirmar si sigue cerrado o ya está abierto.
          </Text>
        </View>
      )}

      {signedIn && userId ? <MyReports userId={userId} /> : null}
    </SnapSheet>
  );
}
