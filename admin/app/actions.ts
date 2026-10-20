"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getSessionProfile } from "@/lib/auth";
import {
  CLOSURE_DESCRIPTION_MAX,
  CLOSURE_DESCRIPTION_MIN,
  CLOSURE_MAX_SEGMENTS,
  CLOSURE_NOTE_MAX,
  CONTRIBUTION_BODY_MAX,
  CONTRIBUTION_NOTE_MAX,
  isClosureCategory,
  isContributionStatus,
  isKind,
  isTone,
} from "@/lib/catalog";
import { deleteRouteImage, uploadRouteImage } from "@/lib/cloudinary";
import { createClient } from "@/lib/supabase/server";

async function adminSession() {
  const profile = await getSessionProfile();
  if (!profile || profile.role !== "admin") {
    throw new Error("Solo un admin puede cambiar el catálogo.");
  }
  return { profile, supabase: await createClient() };
}

async function adminClient() {
  return (await adminSession()).supabase;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

async function writePlaceFicha(formData: FormData, kind: "building" | "space") {
  const supabase = await adminClient();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!id || !name) {
    throw new Error("La ficha necesita código y nombre.");
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
  revalidatePath("/espacios");
  revalidatePath(`/espacios/${id}`);
  return id;
}

export async function updatePlace(formData: FormData) {
  const kind = String(formData.get("kind") ?? "");
  if (!isKind(kind)) {
    throw new Error("La ficha necesita un tipo.");
  }
  await writePlaceFicha(formData, kind);
  redirect("/places");
}

export async function updateSpace(formData: FormData) {
  await writePlaceFicha(formData, "space");
  redirect("/espacios");
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

async function nextImageUrl(routeId: number, formData: FormData) {
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    return uploadRouteImage(routeId, file);
  }
  if (formData.get("remove_image") === "on") {
    await deleteRouteImage(routeId);
    return null;
  }
  return undefined;
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

  const imageUrl = await nextImageUrl(routeId, formData);
  if (imageUrl !== undefined) {
    const { error } = await supabase.from("routes").update({ image_url: imageUrl }).eq("id", routeId);
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
  await deleteRouteImage(routeId);
  const { error } = await supabase.from("routes").delete().eq("id", routeId);
  if (error) throw new Error(error.message);
  revalidatePath("/routes");
  redirect("/routes");
}

function contributionFields(formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) throw new Error("La información necesita un texto.");
  if (body.length > CONTRIBUTION_BODY_MAX) {
    throw new Error(`El texto admite hasta ${CONTRIBUTION_BODY_MAX} caracteres.`);
  }
  return { body };
}

function revalidateContribution(placeId: string) {
  revalidatePath("/contributions");
  revalidatePath(`/places/${placeId}`);
}

/** Crea (ya publicada) o edita información contextual de un espacio. */
export async function saveContribution(formData: FormData) {
  const { supabase, profile } = await adminSession();
  const fields = contributionFields(formData);
  const rawId = String(formData.get("id") ?? "").trim();

  if (!rawId) {
    const placeId = String(formData.get("place_id") ?? "").trim();
    if (!placeId) throw new Error("Elige el espacio de esta información.");
    const { data, error } = await supabase
      .from("contributions")
      .insert({ place_id: placeId, author_id: profile.id, status: "approved", ...fields })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    revalidateContribution(placeId);
    redirect(`/contributions/${data.id}`);
  }

  const id = Number(rawId);
  if (!Number.isFinite(id)) throw new Error("La información no existe.");
  const { data, error } = await supabase
    .from("contributions")
    .update(fields)
    .eq("id", id)
    .select("place_id")
    .single();
  if (error) throw new Error(error.message);
  revalidateContribution(data.place_id);
  redirect(`/contributions/${id}`);
}

/** Aprueba, rechaza o devuelve a pendiente. La base registra quién y cuándo. */
export async function reviewContribution(formData: FormData) {
  const supabase = await adminClient();
  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("review_note") ?? "").trim();
  if (!Number.isFinite(id) || !isContributionStatus(decision)) {
    throw new Error("No se pudo revisar la información.");
  }
  if (note.length > CONTRIBUTION_NOTE_MAX) {
    throw new Error(`La nota admite hasta ${CONTRIBUTION_NOTE_MAX} caracteres.`);
  }

  const { data, error } = await supabase
    .from("contributions")
    .update({ status: decision, review_note: note || null })
    .eq("id", id)
    .select("place_id")
    .single();
  if (error) throw new Error(error.message);
  revalidateContribution(data.place_id);
  redirect("/contributions");
}

export async function deleteContribution(formData: FormData) {
  const supabase = await adminClient();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) throw new Error("La información no existe.");
  const { data, error } = await supabase
    .from("contributions")
    .delete()
    .eq("id", id)
    .select("place_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) revalidateContribution(data.place_id);
  else revalidatePath("/contributions");
  redirect("/contributions");
}

const SEGMENT_KEY = /^(osm|pasillo):[0-9]+$/;
const CLOSURE_MAX_HOURS = 90 * 24;

export type ClosureFormState = { error: string | null; existingId?: number | null };

function closureErrorMessage(error: { message: string; details?: string | null }) {
  const detail = error.details?.trim();
  if (error.message === "closure_overlap") {
    return {
      error: "Uno de los tramos ya tiene un cierre activo. Ábrelo para confirmarlo o extenderlo.",
      existingId: Number(detail) || null,
    };
  }
  if (error.message.startsWith("closure_") && detail) return { error: detail };
  return { error: error.message };
}

function revalidateClosures(id?: number) {
  revalidatePath("/closures");
  if (id != null) revalidatePath(`/closures/${id}`);
}

export async function createAdminClosure(
  _state: ClosureFormState,
  formData: FormData,
): Promise<ClosureFormState> {
  const supabase = await adminClient();
  let keys: unknown;
  try {
    keys = JSON.parse(String(formData.get("segment_keys") ?? "[]"));
  } catch {
    keys = [];
  }
  const segmentKeys = Array.isArray(keys)
    ? [...new Set(keys.filter((key): key is string => typeof key === "string" && SEGMENT_KEY.test(key)))]
    : [];
  const category = String(formData.get("category") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const hours = Number(formData.get("duration_hours"));

  if (segmentKeys.length === 0) return { error: "Elige al menos un tramo en el mapa." };
  if (segmentKeys.length > CLOSURE_MAX_SEGMENTS) {
    return { error: `Un cierre admite hasta ${CLOSURE_MAX_SEGMENTS} tramos.` };
  }
  if (!isClosureCategory(category)) return { error: "Elige el motivo del cierre." };
  if (description.length < CLOSURE_DESCRIPTION_MIN || description.length > CLOSURE_DESCRIPTION_MAX) {
    return {
      error: `La descripción debe tener entre ${CLOSURE_DESCRIPTION_MIN} y ${CLOSURE_DESCRIPTION_MAX} caracteres.`,
    };
  }
  if (!Number.isFinite(hours) || hours < 1 || hours > CLOSURE_MAX_HOURS) {
    return { error: "Elige cuánto dura el cierre." };
  }

  const { data, error } = await supabase.rpc("report_closure", {
    p_segment_keys: segmentKeys,
    p_category: category,
    p_description: description,
    p_on_site: false,
    p_position_source: "simulated",
    p_estimated_hours: Math.min(720, Math.round(hours)),
    p_as_admin: true,
    p_expires_at: new Date(Date.now() + hours * 3_600_000).toISOString(),
  });
  if (error) return closureErrorMessage(error);
  revalidateClosures();
  redirect(`/closures/${Number(data)}`);
}

export async function resolveClosure(formData: FormData) {
  const supabase = await adminClient();
  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("review_note") ?? "").trim();
  if (!Number.isInteger(id) || !["confirmed", "rejected", "reopened"].includes(decision)) {
    throw new Error("No se pudo resolver el cierre.");
  }
  if (note.length > CLOSURE_NOTE_MAX) {
    throw new Error(`La nota admite hasta ${CLOSURE_NOTE_MAX} caracteres.`);
  }
  const { error } = await supabase
    .from("road_closures")
    .update({ status: decision, review_note: note || null })
    .eq("id", id);
  if (error) throw new Error(closureErrorMessage(error).error);
  revalidateClosures(id);
  redirect(`/closures/${id}`);
}

export async function extendClosure(formData: FormData) {
  const supabase = await adminClient();
  const id = Number(formData.get("id"));
  const hours = Number(formData.get("duration_hours"));
  if (!Number.isInteger(id) || !Number.isFinite(hours) || hours < 1 || hours > CLOSURE_MAX_HOURS) {
    throw new Error("Elige cuánto más dura el cierre.");
  }
  const { error } = await supabase
    .from("road_closures")
    .update({ expires_at: new Date(Date.now() + hours * 3_600_000).toISOString() })
    .eq("id", id);
  if (error) throw new Error(closureErrorMessage(error).error);
  revalidateClosures(id);
  redirect(`/closures/${id}`);
}
