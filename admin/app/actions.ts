"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionProfile } from "@/lib/auth";
import { isKind, isTone } from "@/lib/catalog";
import { createClient } from "@/lib/supabase/server";

async function adminClient() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Solo un admin puede cambiar el catálogo.");
  }
  return createClient();
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function updatePlace(formData: FormData) {
  const supabase = await adminClient();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  if (!id || !name || !isKind(kind)) {
    throw new Error("La ficha necesita código, nombre y tipo.");
  }

  const { error } = await supabase
    .from("places")
    .update({
      name,
      kind,
      description: description || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const selected = formData.getAll("category_id").map(String);
  const { data: current, error: readError } = await supabase
    .from("place_categories")
    .select("category_id")
    .eq("place_id", id);
  if (readError) throw new Error(readError.message);

  const currentIds = new Set((current ?? []).map((row) => row.category_id as string));
  const nextIds = new Set(selected);
  const toDelete = [...currentIds].filter((categoryId) => !nextIds.has(categoryId));
  const toInsert = [...nextIds].filter((categoryId) => !currentIds.has(categoryId));

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from("place_categories")
      .delete()
      .eq("place_id", id)
      .in("category_id", toDelete);
    if (deleteError) throw new Error(deleteError.message);
  }
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("place_categories").insert(
      toInsert.map((categoryId) => ({ place_id: id, category_id: categoryId })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  revalidatePath("/places");
  revalidatePath(`/places/${id}`);
  redirect("/places");
}

export async function createCategory(formData: FormData) {
  const supabase = await adminClient();
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const tone = String(formData.get("tone") ?? "");
  if (!/^[a-z0-9_]+$/.test(id) || !name || !isTone(tone)) {
    throw new Error("El id va en minúsculas (comida). Elige un tono válido.");
  }

  const { data: last } = await supabase
    .from("categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("categories").insert({
    id,
    name,
    description: description || null,
    tone,
    sort_order: (last?.sort_order ?? -1) + 1,
    active: formData.get("active") === "on",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/categories");
  revalidatePath(`/categories/${id}`);
  redirect(`/categories/${id}`);
}

export async function updateCategory(formData: FormData) {
  const supabase = await adminClient();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const tone = String(formData.get("tone") ?? "");
  if (!id || !name || !isTone(tone)) {
    throw new Error("La categoría necesita nombre y tono.");
  }

  const { error } = await supabase
    .from("categories")
    .update({
      name,
      description: description || null,
      tone,
      active: formData.get("active") === "on",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/categories");
  revalidatePath(`/categories/${id}`);
  redirect("/categories");
}

export async function moveCategory(formData: FormData) {
  const supabase = await adminClient();
  const id = String(formData.get("id") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!id || (direction !== "up" && direction !== "down")) {
    throw new Error("No se pudo mover la categoría.");
  }

  const { data, error } = await supabase
    .from("categories")
    .select("id, sort_order, name")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(error.message);

  const list = data ?? [];
  const index = list.findIndex((row) => row.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= list.length) return;

  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  for (const [position, row] of next.entries()) {
    if (row.sort_order === position) continue;
    const { error: updateError } = await supabase.from("categories").update({ sort_order: position }).eq("id", row.id);
    if (updateError) throw new Error(updateError.message);
  }
  revalidatePath("/categories");
}

export async function deleteCategory(formData: FormData) {
  const supabase = await adminClient();
  const id = String(formData.get("id") ?? "");
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/categories");
  revalidatePath("/places");
  redirect("/categories");
}

function routeFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const published = formData.get("published") === "on";
  const placeIds: string[] = [];
  for (const value of formData.getAll("place_id")) {
    const placeId = String(value);
    if (placeId && !placeIds.includes(placeId)) placeIds.push(placeId);
  }
  if (!name) throw new Error("La ruta necesita un nombre.");
  if (published && placeIds.length < 2) {
    throw new Error("Para publicar hacen falta al menos dos sitios distintos.");
  }
  return { name, description: description || null, published, placeIds };
}

async function replaceStops(
  supabase: Awaited<ReturnType<typeof adminClient>>,
  routeId: number,
  placeIds: string[],
) {
  const { error: deleteError } = await supabase.from("route_stops").delete().eq("route_id", routeId);
  if (deleteError) throw new Error(deleteError.message);
  if (placeIds.length === 0) return;
  const { error: insertError } = await supabase.from("route_stops").insert(
    placeIds.map((placeId, position) => ({
      route_id: routeId,
      place_id: placeId,
      position,
    })),
  );
  if (insertError) throw new Error(insertError.message);
}

export async function saveRoute(formData: FormData) {
  const supabase = await adminClient();
  const fields = routeFields(formData);
  const rawId = String(formData.get("id") ?? "").trim();
  let routeId = Number(rawId);

  if (!rawId) {
    const { data, error } = await supabase
      .from("routes")
      .insert({
        name: fields.name,
        description: fields.description,
        published: fields.published,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    routeId = data.id;
  } else {
    if (!Number.isFinite(routeId)) throw new Error("La ruta no existe.");
    const { error } = await supabase
      .from("routes")
      .update({
        name: fields.name,
        description: fields.description,
        published: fields.published,
      })
      .eq("id", routeId);
    if (error) throw new Error(error.message);
  }

  await replaceStops(supabase, routeId, fields.placeIds);
  revalidatePath("/routes");
  revalidatePath(`/routes/${routeId}`);
  redirect(`/routes/${routeId}`);
}

export async function deleteRoute(formData: FormData) {
  const supabase = await adminClient();
  const routeId = Number(formData.get("id"));
  if (!Number.isFinite(routeId)) throw new Error("La ruta no existe.");
  const { error } = await supabase.from("routes").delete().eq("id", routeId);
  if (error) throw new Error(error.message);
  revalidatePath("/routes");
  redirect("/routes");
}
