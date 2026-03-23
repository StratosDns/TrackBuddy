export type MealType = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  created_at: string;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'rejected';

export interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendshipStatus;
  created_at: string;
  requester?: Profile;
  addressee?: Profile;
}

export interface Food {
  id: string;
  user_id: string;
  name: string;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  is_public: boolean;
  created_at: string;
}

export interface FoodLog {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  meal_type: MealType;
  food_id: string;
  amount_g: number;
  created_at: string;
  food?: Food;
}

export interface WeightLog {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  weight_kg: number;
  created_at: string;
}

export interface DayMacros {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface MealMacros extends DayMacros {
  entries: (FoodLog & { food: Food })[];
}

export interface DaySummary {
  date: string;
  meals: Record<MealType, MealMacros>;
  total: DayMacros;
  weight?: number;
}

export function calcMacros(food: Food, amount_g: number): DayMacros {
  const factor = amount_g / 100;
  return {
    calories: Math.round(food.calories_per_100g * factor),
    protein: Math.round(food.protein_per_100g * factor * 10) / 10,
    carbs: Math.round(food.carbs_per_100g * factor * 10) / 10,
    fats: Math.round(food.fats_per_100g * factor * 10) / 10,
  };
}

export function sumMacros(a: DayMacros, b: DayMacros): DayMacros {
  return {
    calories: a.calories + b.calories,
    protein: Math.round((a.protein + b.protein) * 10) / 10,
    carbs: Math.round((a.carbs + b.carbs) * 10) / 10,
    fats: Math.round((a.fats + b.fats) * 10) / 10,
  };
}

export const ZERO_MACROS: DayMacros = { calories: 0, protein: 0, carbs: 0, fats: 0 };

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
};

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner'];
