import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/auth";
import { ContributionComposer } from "@/components/ContributionComposer";
import { fetchPublishedInfo, formatDate, submitInfo, type PublishedInfo } from "@/contributions";
import { useMapPanel, type PlaceDetailsTarget } from "@/map-panel";
import type { CatalogTone } from "@/places";

const TONE_COLORS: Record<CatalogTone | "none", { soft: string; strong: string }> = {
  food: { soft: "#f6efe4", strong: "#9a6a2f" },
  sport: { soft: "#e6f0e9", strong: "#2f6b4a" },
  library: { soft: "#e7eef3", strong: "#335c7a" },
  culture: { soft: "#f0e9ef", strong: "#7a4a6e" },
  academic: { soft: "#ecebf5", strong: "#4b4a8a" },
  none: { soft: "#f2f2f4", strong: "#111111" },
};

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <View className="mb-3 mt-8 flex-row items-center">
      <Text className="text-[17px] font-bold tracking-tight text-[#111111]">{title}</Text>
      {count ? (
        <View className="ml-2 h-6 min-w-6 items-center justify-center rounded-full bg-[#f2f2f4] px-2">
          <Text className="text-[12px] font-bold text-[#3a3a3c]">{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

const DESCRIPTION_PREVIEW_LINES = 3;

function AboutSection({ text, accent }: { text: string; accent: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const toggle = () => setExpanded((value) => !value);

  return (
    <View className="mt-8">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? "Contraer descripción" : "Expandir descripción"}
        onPress={toggle}
        className="mb-3 flex-row items-center active:opacity-70"
      >
        <Text className="flex-1 text-[17px] font-bold tracking-tight text-[#111111]">Sobre este espacio</Text>
        <View className="size-8 items-center justify-center rounded-full bg-[#f2f2f4]">
          <MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={20} color="#3a3a3c" />
        </View>
      </Pressable>

      <Pressable accessible={false} onPress={toggle}>
        <Text
          className="font-sans text-[15px] leading-5.75 text-[#3a3a3c]"
          numberOfLines={expanded ? undefined : DESCRIPTION_PREVIEW_LINES}
          onTextLayout={(event) => {
            if (!expanded && event.nativeEvent.lines.length >= DESCRIPTION_PREVIEW_LINES) setOverflows(true);
          }}
        >
          {text}
        </Text>
        {overflows || expanded ? (
          <Text className="mt-2 text-[14px] font-bold" style={{ color: accent }}>
            {expanded ? "Leer menos" : "Leer más"}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

function InfoSkeleton() {
  return (
    <View>
      {[0, 1].map((key) => (
        <View key={key} className="mb-3 rounded-3xl border border-[#f0f0f2] p-5">
          <View className="h-3 w-11/12 rounded-full bg-[#f2f2f4]" />
          <View className="mt-2.5 h-3 w-4/5 rounded-full bg-[#f2f2f4]" />
          <View className="mt-2.5 h-3 w-2/5 rounded-full bg-[#f2f2f4]" />
        </View>
      ))}
    </View>
  );
}

function InfoCard({ entry }: { entry: PublishedInfo }) {
  return (
    <View
      className="mb-3 rounded-3xl border border-[#f0f0f2] bg-white p-5"
      style={{
        shadowColor: "#1c1c28",
        shadowOpacity: 0.04,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 1,
      }}
    >
      <Text className="font-sans text-[15px] leading-5.75 text-[#2c2c2e]">{entry.body}</Text>
      <View className="mt-4 flex-row items-center">
        <MaterialIcons name="verified" size={14} color="#1f8a4c" />
        <Text className="ml-1 font-sans text-[12px] text-[#8e8e93]">Revisado · aportado el {formatDate(entry.createdAt)}</Text>
      </View>
    </View>
  );
}

function EmptyInfo({ placeName }: { placeName: string }) {
  return (
    <View className="items-center rounded-3xl bg-[#f7f7f9] px-6 py-8">
      <View className="size-14 items-center justify-center rounded-full bg-white">
        <MaterialIcons name="forum" size={26} color="#3a3a3c" />
      </View>
      <Text className="mt-4 text-center text-[15px] font-bold text-[#111111]">Aún no hay información</Text>
      <Text className="mt-1 text-center font-sans text-[13px] leading-5 text-[#6e6e73]">
        Sé la primera persona en contar qué hay en {placeName}: horarios, servicios o cómo llegar.
      </Text>
    </View>
  );
}

export function PlaceDetailsScreen({ target }: { target: PlaceDetailsTarget }) {
  const { profile } = useAuth();
  const { closePlaceDetails, setProfileOpen } = useMapPanel();
  const userId = profile?.id ?? null;
  const colors = TONE_COLORS[target.tone ?? "none"];

  const [info, setInfo] = useState<PublishedInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [composerKey, setComposerKey] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setInfo(await fetchPublishedInfo(target.code));
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "No se pudo cargar la información.");
      setInfo((current) => current ?? []);
    }
  }, [target.code]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) setComposerOpen(false);
  }, [userId]);

  const openComposer = () => {
    setComposerKey((key) => key + 1);
    setComposerOpen(true);
  };

  const count = info?.length ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#ffffff" }} edges={["top"]}>
      <View className="flex-row items-center px-5 pb-2 pt-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al mapa"
          onPress={closePlaceDetails}
          hitSlop={8}
          className="size-10 items-center justify-center rounded-full bg-[#f2f2f4] active:opacity-80"
        >
          <MaterialIcons name="arrow-back" size={20} color="#111111" />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center rounded-3xl p-4" style={{ backgroundColor: colors.soft }}>
          <View
            className="size-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.strong }}
          >
            <Text className="text-[14px] font-extrabold text-white" numberOfLines={1}>
              {target.code.slice(0, 4)}
            </Text>
          </View>

          <View className="ml-3.5 min-w-0 flex-1">
            <Text className="text-[19px] font-extrabold leading-6 tracking-tight text-[#111111]" numberOfLines={2}>
              {target.title}
            </Text>
            <View className="mt-1.5 flex-row flex-wrap items-center">
              {target.categories.map((category) => (
                <Text
                  key={category}
                  className="mr-2 text-[13px] font-semibold"
                  style={{ color: colors.strong }}
                >
                  {category}
                </Text>
              ))}
              {target.categories.length > 0 ? (
                <View className="mr-2 size-1 rounded-full bg-black/20" />
              ) : null}
              <MaterialIcons name="forum" size={13} color="#6e6e73" />
              <Text className="ml-1 font-sans text-[13px] text-[#6e6e73]">
                {info === null ? "…" : count === 0 ? "Sin aportes" : `${count} ${count === 1 ? "aporte" : "aportes"}`}
              </Text>
            </View>
          </View>
        </View>

        {target.description ? <AboutSection text={target.description} accent={colors.strong} /> : null}

        <SectionHeader title="Información del espacio" count={count} />
        {info === null ? (
          <InfoSkeleton />
        ) : count > 0 ? (
          info.map((entry) => <InfoCard key={entry.id} entry={entry} />)
        ) : loadError ? null : (
          <EmptyInfo placeName={target.title} />
        )}

        {loadError ? (
          <View className="mt-1 flex-row items-center rounded-2xl border border-[rgba(180,40,40,0.18)] bg-[#fff5f5] px-3.5 py-3">
            <MaterialIcons name="wifi-off" size={18} color="#8a1f1f" />
            <Text className="ml-2 flex-1 text-sm font-semibold leading-5 text-[#8a1f1f]">{loadError}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar"
              onPress={() => {
                setInfo(null);
                void load();
              }}
              hitSlop={8}
              className="ml-2 active:opacity-60"
            >
              <Text className="text-sm font-bold text-[#8a1f1f]">Reintentar</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View className="border-t border-[#f0f0f2] bg-white px-5 pb-3 pt-3">
        {userId ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aportar información"
            onPress={openComposer}
            className="h-14 flex-row items-center justify-center rounded-2xl bg-[#111111] active:opacity-80"
          >
            <MaterialIcons name="edit-note" size={22} color="#ffffff" />
            <Text className="ml-2 text-[15px] font-bold text-white">Aportar información</Text>
          </Pressable>
        ) : (
          <View className="flex-row items-center">
            <View className="min-w-0 flex-1 pr-3">
              <Text className="text-[15px] font-bold text-[#111111]">¿Conoces este espacio?</Text>
              <Text className="mt-0.5 font-sans text-[13px] text-[#6e6e73]">Inicia sesión para aportar información.</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Iniciar sesión"
              onPress={() => setProfileOpen(true)}
              className="h-11 flex-row items-center justify-center rounded-full bg-[#111111] px-5 active:opacity-80"
            >
              <Text className="text-[14px] font-bold text-white">Entrar</Text>
            </Pressable>
          </View>
        )}
      </View>

      {userId ? (
        <ContributionComposer
          key={composerKey}
          visible={composerOpen}
          placeName={target.title}
          onClose={() => setComposerOpen(false)}
          onSubmit={(body) => submitInfo(target.code, userId, body)}
          onSeeMine={() => {
            setComposerOpen(false);
            closePlaceDetails();
            setProfileOpen(true);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}
