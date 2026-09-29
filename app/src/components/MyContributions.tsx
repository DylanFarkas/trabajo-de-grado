import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import { ContributionComposer } from "@/components/ContributionComposer";
import {
  deleteMyInfo,
  fetchMyContributions,
  formatDate,
  updateMyInfo,
  type ContributionStatus,
  type MyContribution,
} from "@/contributions";

const STATUS: Record<
  ContributionStatus,
  { label: string; plural: string; icon: keyof typeof MaterialIcons.glyphMap; fg: string; bg: string }
> = {
  pending: { label: "En revisión", plural: "En revisión", icon: "schedule", fg: "#8a5a00", bg: "#fff6e0" },
  approved: { label: "Publicado", plural: "Publicados", icon: "check-circle", fg: "#1f6b3a", bg: "#eaf6ee" },
  rejected: { label: "Rechazado", plural: "Rechazados", icon: "cancel", fg: "#8a1f1f", bg: "#fff0f0" },
};

const ORDER: ContributionStatus[] = ["pending", "approved", "rejected"];

function StatusBadge({ status }: { status: ContributionStatus }) {
  const meta = STATUS[status];
  return (
    <View className="h-6 flex-row items-center rounded-full px-2" style={{ backgroundColor: meta.bg }}>
      <MaterialIcons name={meta.icon} size={13} color={meta.fg} />
      <Text className="ml-1 text-[11px] font-bold" style={{ color: meta.fg }}>
        {meta.label}
      </Text>
    </View>
  );
}

function ContributionCard({
  item,
  onEdit,
  onDelete,
}: {
  item: MyContribution;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View className="mb-3 rounded-3xl border border-[#f0f0f2] bg-white p-4">
      <View className="flex-row items-center">
        <View className="size-8 items-center justify-center rounded-xl bg-[#f2f2f4]">
          <MaterialIcons name="place" size={16} color="#111111" />
        </View>
        <Text className="ml-2.5 min-w-0 flex-1 pr-2 text-[14px] font-bold text-[#111111]" numberOfLines={1}>
          {item.placeName}
        </Text>
        <StatusBadge status={item.status} />
      </View>

      <Text className="mt-3 font-sans text-[15px] leading-5.5 text-[#2c2c2e]" numberOfLines={5}>
        {item.body}
      </Text>

      {item.status === "rejected" && item.reviewNote ? (
        <View className="mt-3 rounded-2xl bg-[#fff5f5] px-3 py-2.5">
          <Text className="text-[12px] font-bold text-[#8a1f1f]">Motivo del rechazo</Text>
          <Text className="mt-0.5 font-sans text-[13px] leading-5 text-[#8a1f1f]">{item.reviewNote}</Text>
        </View>
      ) : null}

      <View className="mt-3 flex-row items-center">
        <Text className="flex-1 font-sans text-[12px] text-[#8e8e93]">{formatDate(item.createdAt)}</Text>
        {item.status === "pending" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Editar aporte"
            onPress={onEdit}
            hitSlop={6}
            className="h-8 flex-row items-center rounded-full bg-[#f2f2f4] px-3 active:opacity-80"
          >
            <MaterialIcons name="edit" size={14} color="#111111" />
            <Text className="ml-1 text-[12px] font-bold text-[#111111]">Editar</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Eliminar aporte"
          onPress={onDelete}
          hitSlop={6}
          className="ml-2 size-8 items-center justify-center rounded-full bg-[#fff0f0] active:opacity-80"
        >
          <MaterialIcons name="delete-outline" size={16} color="#8a1f1f" />
        </Pressable>
      </View>
    </View>
  );
}

export function MyContributions({ userId }: { userId: string }) {
  const [items, setItems] = useState<MyContribution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ContributionStatus | null>(null);
  const [editing, setEditing] = useState<MyContribution | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await fetchMyContributions(userId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar tus aportes.");
      setItems((current) => current ?? []);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = (item: MyContribution) => {
    const message =
      item.status === "approved"
        ? `Tu aporte sobre ${item.placeName} está publicado. Si lo eliminas, dejará de verse en la app.`
        : `Se borrará tu aporte sobre ${item.placeName}.`;
    Alert.alert("Eliminar aporte", message, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: () => {
          void deleteMyInfo(item.id)
            .then(load)
            .catch((caught: unknown) =>
              setError(caught instanceof Error ? caught.message : "No se pudo eliminar."),
            );
        },
      },
    ]);
  };

  const counts = ORDER.reduce(
    (acc, status) => ({ ...acc, [status]: (items ?? []).filter((item) => item.status === status).length }),
    {} as Record<ContributionStatus, number>,
  );
  const visible = (items ?? []).filter((item) => !filter || item.status === filter);

  return (
    <View className="mt-8">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[17px] font-bold tracking-tight text-[#111111]">Mis aportes</Text>
        {items && items.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Actualizar"
            onPress={() => {
              void load();
            }}
            hitSlop={8}
            className="size-8 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80"
          >
            <MaterialIcons name="refresh" size={18} color="#3a3a3c" />
          </Pressable>
        ) : null}
      </View>

      {items === null ? (
        <View className="items-center py-10">
          <ActivityIndicator size="small" color="#111111" />
        </View>
      ) : items.length === 0 ? (
        <View className="items-center rounded-3xl bg-[#f7f7f9] px-6 py-8">
          <View className="size-14 items-center justify-center rounded-full bg-white">
            <MaterialIcons name="edit-note" size={28} color="#3a3a3c" />
          </View>
          <Text className="mt-4 text-center text-[15px] font-bold text-[#111111]">Aún no has aportado</Text>
          <Text className="mt-1 text-center font-sans text-[13px] leading-5 text-[#6e6e73]">
            Toca un edificio en el mapa, elige “Ver más detalles” y cuéntale a la comunidad qué hay ahí.
          </Text>
        </View>
      ) : (
        <>
          <View className="mb-4 flex-row">
            {ORDER.map((status, index) => {
              const meta = STATUS[status];
              const active = filter === status;
              return (
                <Pressable
                  key={status}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`${meta.plural}: ${counts[status]}`}
                  onPress={() => setFilter(active ? null : status)}
                  className={`flex-1 rounded-2xl px-3 py-3 ${index > 0 ? "ml-2" : ""} ${
                    active ? "bg-[#111111]" : "bg-[#f5f5f7]"
                  }`}
                >
                  <Text className={`text-[22px] font-extrabold ${active ? "text-white" : "text-[#111111]"}`}>
                    {counts[status]}
                  </Text>
                  <Text
                    className={`mt-0.5 text-[12px] font-semibold ${active ? "text-white/70" : "text-[#6e6e73]"}`}
                    numberOfLines={1}
                  >
                    {meta.plural}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {visible.length === 0 ? (
            <Text className="py-6 text-center font-sans text-[13px] text-[#8e8e93]">
              No tienes aportes {filter ? STATUS[filter].plural.toLowerCase() : ""}.
            </Text>
          ) : (
            visible.map((item) => (
              <ContributionCard
                key={item.id}
                item={item}
                onEdit={() => setEditing(item)}
                onDelete={() => confirmDelete(item)}
              />
            ))
          )}
        </>
      )}

      {error ? (
        <View className="mt-2 flex-row items-start rounded-2xl border border-[rgba(180,40,40,0.18)] bg-[#fff5f5] px-3.5 py-3">
          <MaterialIcons name="info-outline" size={18} color="#8a1f1f" />
          <Text className="ml-2 flex-1 text-sm font-semibold leading-5 text-[#8a1f1f]">{error}</Text>
        </View>
      ) : null}

      {editing ? (
        <ContributionComposer
          key={editing.id}
          visible
          placeName={editing.placeName}
          initialBody={editing.body}
          onClose={() => setEditing(null)}
          onSubmit={async (body) => {
            await updateMyInfo(editing.id, body);
            await load();
          }}
        />
      ) : null}
    </View>
  );
}
