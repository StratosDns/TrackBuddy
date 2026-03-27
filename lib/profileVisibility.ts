const DEFAULT_FRIEND_VISIBILITY: Record<string, boolean> = {
  age: true,
  height: true,
  weight: true,
  calorie_target: true,
  macro_targets: true,
  water_target: true,
  diagrams: true,
};

export function normalizeFriendVisibility(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_FRIEND_VISIBILITY;
  }
  return { ...DEFAULT_FRIEND_VISIBILITY, ...(value as Record<string, boolean>) };
}
