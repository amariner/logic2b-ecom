import type { DemoTheme } from './demo-themes';

export const THEME_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'moda', label: 'Moda y accesorios' },
  { id: 'hogar', label: 'Hogar e interiorismo' },
  { id: 'cuidado', label: 'Cuidado y alimentación' },
  { id: 'tecnico', label: 'Técnico y B2B' },
  { id: 'lanzamiento', label: 'Lanzamientos' },
] as const;

export type ThemeFilterId = (typeof THEME_FILTERS)[number]['id'];
export type ThemeCategoryId = Exclude<ThemeFilterId, 'all'>;

const THEME_CATEGORIES = {
  editorial: ['tecnico'],
  industrial: ['tecnico'],
  natural: ['cuidado'],
  guide: ['cuidado'],
  specs: ['tecnico'],
  minimal: ['moda', 'hogar'],
  arce: ['hogar'],
  launch: ['lanzamiento'],
  street: ['moda', 'lanzamiento'],
  iris: ['moda', 'lanzamiento'],
  noddo: ['tecnico', 'hogar'],
  sitega: ['hogar'],
  forma: ['moda'],
  stretch: ['cuidado'],
} as const satisfies Readonly<Record<string, readonly ThemeCategoryId[]>>;

export function normalizeThemeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

export function themeCategoryIds(theme: Pick<DemoTheme, 'id'>): readonly ThemeCategoryId[] {
  return THEME_CATEGORIES[theme.id as keyof typeof THEME_CATEGORIES] ?? [];
}

export function themeSearchText(
  theme: Pick<DemoTheme, 'label' | 'hint' | 'bestFor' | 'reference'>,
): string {
  return normalizeThemeSearch([
    theme.label,
    theme.hint,
    ...theme.bestFor,
    theme.reference?.name ?? '',
  ].join(' '));
}
