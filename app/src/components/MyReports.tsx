import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import {
  CLOSURE_STATUS_LABEL,
  categoryLabel,
  effectiveStatus,
  fetchMyReports,
  type ClosureStatus,
  type MyReport,
} from "@/closures";
import { formatDate } from "@/contributions";

type Group = "pending" | "active" | "done";

const GROUP_OF: Record<ClosureStatus, Group> = {
  candidate: "pending",
  provisional: "pending",
  confirmed: "active",
  expired: "done",
  reopened: "done",
  rejected: "done",
};

const GROUPS: { id: Group; plural: string }[] = [
  { id: "pending", plural: "Por confirmar" },
  { id: "active", plural: "Activos" },
  { id: "done", plural: "Terminados" },
];

const BADGE: Record<ClosureStatus, { icon: keyof typeof MaterialIcons.glyphMap; fg: string; bg: string }> = {
  candidate: { icon: "schedule", fg: "#3a3a3c", bg: "#f2f2f4" },
  provisional: { icon: "my-location", fg: "#8a5a00", bg: "#fff6e0" },
  confirmed: { icon: "block", fg: "#b42318", bg: "#fdecec" },
  expired: { icon: "timer-off", fg: "#6e6e73", bg: "#f2f2f4" },
  reopened: { icon: "check-circle", fg: "#1f6b3a", bg: "#eaf6ee" },
  rejected: { icon: "cancel", fg: "#8a1f1f", bg: "#fff0f0" },
};

function ReportCard({ item }: { item: MyReport }) {
  const status = effectiveStatus(item);
  const badge = BADGE[status];
  return (
    <View className="mb-3 rounded-3xl border border-[#f0f0f2] bg-white p-4 dark:border-[#232c3a] dark:bg-[#18202a]">
      <View className="flex-row items-center">
        <View className="size-8 items-center justify-center rounded-xl bg-[#f2f2f4] dark:bg-[#232c3a]">
          <MaterialIcons name="block" size={16} color="#b42318" />
        </View>
        <Text className="ml-2.5 min-w-0 flex-1 pr-2 text-[14px] font-bold text-[#111111] dark:text-[#f2f4f7]" numberOfLines={1}>
          {categoryLabel(item.category)} · {item.segmentCount === 1 ? "1 tramo" : `${item.segmentCount} tramos`}
        </Text>
        <View className="h-6 flex-row items-center rounded-full px-2" style={{ backgroundColor: badge.bg }}>
          <MaterialIcons name={badge.icon} size={13} color={badge.fg} />
          <Text className="ml-1 text-[11px] font-bold" style={{ color: badge.fg }}>
            {CLOSURE_STATUS_LABEL[status]}
          </Text>
        </View>
      </View>

      <Text className="mt-3 font-sans text-[15px] leading-5.5 text-[#2c2c2e] dark:text-[#c5ccd6]" numberOfLines={4}>
        {item.description}
      </Text>

      {status === "rejected" && item.reviewNote ? (
        <View className="mt-3 rounded-2xl bg-[#fff5f5] px-3 py-2.5">
          <Text className="text-[12px] font-bold text-[#8a1f1f]">Nota del administrador</Text>
          <Text className="mt-0.5 font-sans text-[13px] leading-5 text-[#8a1f1f]">{item.reviewNote}</Text>
        </View>
      ) : null}

      <Text className="mt-3 font-sans text-[12px] text-[#8e8e93] dark:text-[#8b95a5]">
        {formatDate(item.createdAt)}
        {item.onSite ? " · reportado en el sitio" : " · reportado a distancia"}
        {GROUP_OF[status] !== "done" ? ` · ${item.confirmScore} a favor, ${item.denyScore} en contra` : ""}
      </Text>
    </View>
  );
}

export function MyReports({ userId }: { userId: string }) {
  const [items, setItems] = useState<MyReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Group | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchMyReports(userId)
      .then((reports) => {
        if (cancelled) return;
        setItems(reports);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "No se pudieron cargar tus reportes.");
        setItems((current) => current ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, reloads]);

  const counts = GROUPS.reduce(
    (acc, group) => ({
      ...acc,
      [group.id]: (items ?? []).filter((item) => GROUP_OF[effectiveStatus(item)] === group.id).length,
    }),
    {} as Record<Group, number>,
  );
  const visible = (items ?? []).filter((item) => !filter || GROUP_OF[effectiveStatus(item)] === filter);

  return (
    <View className="mt-8">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold tracking-tight text-[#111111] dark:text-[#f2f4f7]">Mis reportes</Text>
        {items && items.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Actualizar reportes"
            onPress={() => setReloads((count) => count + 1)}
            hitSlop={8}
            className="size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80 dark:bg-[#232c3a]"
          >
            <MaterialIcons name="refresh" size={18} color="#8b95a5" />
          </Pressable>
        ) : null}
      </View>

      {items === null ? (
        <View className="items-center py-10">
          <ActivityIndicator size="small" color="#111111" />
        </View>
      ) : items.length === 0 ? (
        <View className="items-center rounded-3xl bg-[#f7f7f9] px-6 py-8 dark:bg-[#18202a]">
          <View className="size-14 items-center justify-center rounded-full bg-white dark:bg-[#232c3a]">
            <MaterialIcons name="block" size={28} color="#b42318" />
          </View>
          <Text className="mt-4 text-center text-[15px] font-bold text-[#111111] dark:text-[#f2f4f7]">Aún no has reportado vías</Text>
          <Text className="mt-1 text-center font-sans text-[13px] leading-5 text-[#6e6e73] dark:text-[#8b95a5]">
            Si encuentras un camino cerrado, elige «Vía cerrada» arriba y marca el tramo en el mapa.
          </Text>
        </View>
      ) : (
        <>
          <View className="mb-4 flex-row">
            {GROUPS.map((group, index) => {
              const active = filter === group.id;
              return (
                <Pressable
                  key={group.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${group.plural}: ${counts[group.id]}`}
                  onPress={() => setFilter(active ? null : group.id)}
                  className={`flex-1 rounded-2xl px-3 py-3 ${index > 0 ? "ml-2" : ""} ${
                    active ? "bg-[#111111] dark:bg-[#f2f4f7]" : "bg-[#f5f5f7] dark:bg-[#18202a]"
                  }`}
                >
                  <Text className={`text-[22px] font-extrabold ${active ? "text-white dark:text-[#0b0f16]" : "text-[#111111] dark:text-[#f2f4f7]"}`}>
                    {counts[group.id]}
                  </Text>
                  <Text
                    className={`mt-0.5 text-[12px] font-semibold ${active ? "text-white/70 dark:text-[#0b0f16]/60" : "text-[#6e6e73] dark:text-[#8b95a5]"}`}
                    numberOfLines={1}
                  >
                    {group.plural}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {visible.length === 0 ? (
            <Text className="py-6 text-center font-sans text-[13px] text-[#8e8e93]">
              No tienes reportes {filter ? GROUPS.find((g) => g.id === filter)?.plural.toLowerCase() : ""}.
            </Text>
          ) : (
            visible.map((item) => <ReportCard key={item.id} item={item} />)
          )}
        </>
      )}

      {error ? (
        <View className="mt-2 flex-row items-start rounded-2xl border border-[rgba(180,40,40,0.18)] bg-[#fff5f5] px-3.5 py-3">
          <MaterialIcons name="info-outline" size={18} color="#8a1f1f" />
          <Text className="ml-2 flex-1 text-sm font-semibold leading-5 text-[#8a1f1f]">{error}</Text>
        </View>
      ) : null}
    </View>
  );
}
