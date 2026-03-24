export type AppMode = 'diet' | 'gym';

export const MODE_COOKIE = 'tb_mode';

export function normalizeMode(value: string | null | undefined): AppMode {
  return value === 'gym' ? 'gym' : 'diet';
}
