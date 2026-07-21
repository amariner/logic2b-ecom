/**
 * Resolución del tema ACTIVO en servidor (SSR).
 * ============================================================================
 *
 * El selector de la tienda (Shop.astro) es la capa de venta: aplica en vivo las
 * variables CSS y persiste el tema en `localStorage`. Pero un tema es más que
 * color: los temas estructurales (p. ej. Minimal, con nav lateral) necesitan un
 * DOM distinto, y eso se decide EN RENDER, no con variables CSS.
 *
 * Para que el servidor sepa qué tema pintar, el selector escribe además una
 * cookie de PRESENTACIÓN con el id del tema. Aquí la leemos y devolvemos el tema
 * (o el Base por defecto). Esto es exclusivamente capa de presentación: no toca
 * D1, precios, envíos, checkout, webhook ni emails.
 *
 * Solo se aceptan temas `ready`: un tema `planned` cambiaría tokens pero no
 * tendría componentes, y daría una estructura a medias.
 */
import { defaultTheme, demoThemes, type DemoTheme } from './demo-themes';

/** Cookie de presentación con el id del tema activo. La escribe el selector. */
export const THEME_COOKIE = 'ecom-demo-theme-id';

/** Lo mínimo que necesitamos de `Astro.cookies` (evita depender de tipos de astro). */
type CookieReader = { get(name: string): { value: string } | undefined };

/**
 * Devuelve el tema activo según la cookie, o el Base si no hay cookie válida.
 * Nunca devuelve un tema `planned` ni un id desconocido.
 */
export function resolveActiveTheme(cookies: CookieReader): DemoTheme {
  const id = cookies.get(THEME_COOKIE)?.value;
  const theme = demoThemes.find((t) => t.id === id && t.status === 'ready');
  return theme ?? defaultTheme;
}
