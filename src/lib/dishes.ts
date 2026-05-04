import { createClient } from "./supabase/client";
import type { CourseType, Dish, DishVersion, DishSummary, RecipeDocument } from "./types";

// Create a new dish and its first version
export async function createDish(params: {
  name: string;
  course_type?: CourseType;
  hero_ingredient?: string;
  recipe: RecipeDocument;
  commit_message?: string;
  tags?: string[];
}): Promise<Dish> {
  const supabase = createClient();

  const { data: dish, error: dishError } = await supabase
    .from("dishes")
    .insert({
      name: params.name,
      course_type: params.course_type ?? null,
      hero_ingredient: params.hero_ingredient ?? null,
    })
    .select()
    .single();

  if (dishError || !dish) throw new Error(dishError?.message ?? "Failed to create dish");

  await supabase.from("dish_versions").insert({
    dish_id: dish.id,
    version: 1,
    recipe: params.recipe,
    commit_message: params.commit_message ?? "Initial version",
  });

  if (params.tags?.length) {
    await supabase.from("dish_tags").insert(
      params.tags.map((tag) => ({ dish_id: dish.id, tag }))
    );
  }

  return dish;
}

// Save a new version of an existing dish
export async function saveDishVersion(params: {
  dish_id: string;
  recipe: RecipeDocument;
  commit_message?: string;
}): Promise<DishVersion> {
  const supabase = createClient();

  const { data: latest } = await supabase
    .from("dish_versions")
    .select("version")
    .eq("dish_id", params.dish_id)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const nextVersion = (latest?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("dish_versions")
    .insert({
      dish_id: params.dish_id,
      version: nextVersion,
      recipe: params.recipe,
      commit_message: params.commit_message ?? null,
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to save version");
  return data as DishVersion;
}

// Get all versions of a dish
export async function getDishVersions(dish_id: string): Promise<DishVersion[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("dish_versions")
    .select("*")
    .eq("dish_id", dish_id)
    .order("version", { ascending: true });
  return (data ?? []) as DishVersion[];
}

// List dishes with their latest version and tags
export async function listDishes(): Promise<DishSummary[]> {
  const supabase = createClient();

  const { data: dishes } = await supabase
    .from("dishes")
    .select("*")
    .order("created_at", { ascending: false });

  if (!dishes?.length) return [];

  const ids = dishes.map((d) => d.id);

  const [{ data: versions }, { data: tags }] = await Promise.all([
    supabase
      .from("dish_versions")
      .select("*")
      .in("dish_id", ids)
      .order("version", { ascending: false }),
    supabase.from("dish_tags").select("*").in("dish_id", ids),
  ]);

  return dishes.map((dish) => ({
    ...dish,
    latest_version: (versions?.find((v) => v.dish_id === dish.id) ?? null) as DishVersion | null,
    tags: (tags ?? []).filter((t) => t.dish_id === dish.id).map((t) => t.tag),
  }));
}

// Link a session to a dish
export async function linkSessionToDish(session_id: string, dish_id: string) {
  const supabase = createClient();
  await supabase.from("sessions").update({ dish_id }).eq("id", session_id);
}

// Close a session: store summary, delete messages
export async function closeSession(session_id: string, summary: string) {
  const supabase = createClient();
  await supabase
    .from("sessions")
    .update({ summary, closed_at: new Date().toISOString() })
    .eq("id", session_id);
  await supabase.from("messages").delete().eq("session_id", session_id);
}
