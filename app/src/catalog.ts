import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "@/supabase";
import type { CampusCatalog, CatalogTone, CategoryRecord, PlaceRecord } from "@/places";

const STORAGE_KEY = "campus-catalog-v1";
const TONES = new Set<CatalogTone>(["food", "sport", "library", "culture", "academic"]);

type PlaceRow = { id: string; name: string; description: string | null };
type CategoryRow = { id: string; name: string; tone: string; sort_order: number };
type AssignmentRow = { place_id: string; category_id: string };

function asTone(value: string): CatalogTone | null {
  return TONES.has(value as CatalogTone) ? (value as CatalogTone) : null;
}

export async function readCachedCatalog(): Promise<CampusCatalog | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CampusCatalog;
    if (!parsed.places || !parsed.categories || !parsed.assignments) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function refreshCatalog(): Promise<CampusCatalog | null> {
  if (!supabase) return null;

  const [placesResult, categoriesResult, assignmentsResult] = await Promise.all([
    supabase.from("places").select("id, name, description"),
    supabase.from("categories").select("id, name, tone, sort_order").eq("active", true),
    supabase.from("place_categories").select("place_id, category_id"),
  ]);

  if (placesResult.error || categoriesResult.error || assignmentsResult.error) {
    throw placesResult.error ?? categoriesResult.error ?? assignmentsResult.error;
  }

  const places: Record<string, PlaceRecord> = {};
  for (const row of (placesResult.data ?? []) as PlaceRow[]) {
    places[row.id] = { name: row.name, description: row.description };
  }

  const categories: Record<string, CategoryRecord> = {};
  for (const row of (categoriesResult.data ?? []) as CategoryRow[]) {
    const tone = asTone(row.tone);
    if (!tone) continue;
    categories[row.id] = {
      id: row.id,
      name: row.name,
      tone,
      sortOrder: row.sort_order,
    };
  }

  const assignments: Record<string, string[]> = {};
  for (const row of (assignmentsResult.data ?? []) as AssignmentRow[]) {
    if (!categories[row.category_id]) continue;
    const list = assignments[row.place_id] ?? [];
    list.push(row.category_id);
    assignments[row.place_id] = list;
  }

  const catalog: CampusCatalog = { places, categories, assignments };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
  return catalog;
}
