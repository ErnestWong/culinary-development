export type CourseType = "appetizer" | "main" | "dessert" | "side" | "snack" | "beverage";

export interface Session {
  id: string;
  user_id: string | null;
  dish_id: string | null;
  summary: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface DbMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface Dish {
  id: string;
  user_id: string | null;
  name: string;
  course_type: CourseType | null;
  hero_ingredient: string | null;
  created_at: string;
}

// The JSONB shape stored in dish_versions.recipe
export interface RecipeDocument {
  components: RecipeComponent[];
  technique_notes?: string;
  failure_modes_resolved?: string[];
  serving_notes?: string;
}

export interface RecipeComponent {
  name: string;
  role: "hero" | "supporting" | "accent";
  delivery: string;
  intensity: "whisper" | "moderate" | "bold" | "dominant";
  fat_compatibility?: string;
  texture?: string;
  taste_dimensions?: string[];
  notes?: string;
}

export interface DishVersion {
  id: string;
  dish_id: string;
  version: number;
  recipe: RecipeDocument;
  commit_message: string | null;
  created_at: string;
}

export interface DishTag {
  id: string;
  dish_id: string;
  tag: string;
}

// Dish with its latest version and tags — used for display
export interface DishSummary extends Dish {
  latest_version: DishVersion | null;
  tags: string[];
}
