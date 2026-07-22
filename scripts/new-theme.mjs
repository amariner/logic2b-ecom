#!/usr/bin/env node
/**
 * Scaffold de tema/tienda del escaparate — `pnpm new:theme <id>`.
 * ============================================================================
 *
 * Genera el esqueleto del KIT DE TEMA (la columna derecha de la frontera de
 * `docs/PROMPT_9B3.md § 4`) y parchea, de forma idempotente, los registros:
 *
 *   src/components/themes/<id>/{Catalog,ProductGrid,Filters,ProductDetail}.astro
 *   src/collections/<id>.ts
 *   seed/collections/<id>.ts          (stub de 3 productos, slugs namespaceados)
 *   public/images/collections/<id>/.gitkeep
 *   docs/temas/<id>.md                (ficha de entrega)
 *   + entrada en src/lib/collections.ts (marcadores new-theme:*)
 *   + entrada en seed/collections/index.ts
 *   + entrada del tema en src/lib/demo-themes.ts SI FALTA (tokens de Base)
 *
 * QUEDA A MANO (a propósito): valores de tokens, diseño real de los
 * componentes, catálogo completo, copy y receta de imaginería.
 *
 * GUARDARRAÍL: este script solo escribe en las rutas de arriba. Se niega a
 * tocar cualquier otra cosa de `src/lib/`, `src/pages/api/` o `migrations/` —
 * si un tema parece necesitarlo, es trabajo de MOTOR: parar y consultar.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Argumento ───────────────────────────────────────────────────────────────
const id = process.argv[2];
if (!id || !/^[a-z][a-z0-9-]{1,30}$/.test(id)) {
  console.error('Uso: pnpm new:theme <id>   (kebab-case: p. ej. street, industrial)');
  process.exit(1);
}
if (id === 'demo' || id === 'base') {
  console.error(`«${id}» está reservado (tienda genérica / tema Base).`);
  process.exit(1);
}
const ns = id.slice(0, 3); // prefijo de namespacing de slugs (slug es UNIQUE GLOBAL)

// ── Guardarraíl de rutas ────────────────────────────────────────────────────
const ALLOWED = [
  `src/components/themes/${id}/`,
  `src/collections/${id}.ts`,
  `seed/collections/${id}.ts`,
  `seed/collections/index.ts`,
  `public/images/collections/${id}/`,
  `docs/temas/${id}.md`,
  'src/lib/collections.ts',
  'src/lib/demo-themes.ts',
];
function assertAllowed(rel) {
  if (!ALLOWED.some((a) => rel === a || rel.startsWith(a))) {
    console.error(`GUARDARRAÍL: intento de escribir fuera del kit de tema: ${rel}`);
    console.error('Si un tema necesita tocar el motor, es trabajo de motor: parar y consultar.');
    process.exit(1);
  }
}

const created = [];
const skipped = [];
const patched = [];

function writeNew(rel, content) {
  assertAllowed(rel);
  const abs = join(root, rel);
  if (existsSync(abs)) {
    skipped.push(rel);
    return;
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
  created.push(rel);
}

/** Inserta `line` justo encima del marcador, si aún no está (idempotente). */
function patchAtMarker(rel, marker, line, mustContainToSkip) {
  assertAllowed(rel);
  const abs = join(root, rel);
  const src = readFileSync(abs, 'utf8');
  if (src.includes(mustContainToSkip)) {
    skipped.push(`${rel} (ya registrado)`);
    return;
  }
  const idx = src.indexOf(marker);
  if (idx === -1) {
    console.error(`No encuentro el marcador «${marker}» en ${rel}. ¿Se borró? Restáuralo.`);
    process.exit(1);
  }
  const lineStart = src.lastIndexOf('\n', idx) + 1;
  const indent = src.slice(lineStart, idx);
  writeFileSync(abs, src.slice(0, lineStart) + indent + line + '\n' + src.slice(lineStart));
  patched.push(rel);
}

const cap = id[0].toUpperCase() + id.slice(1);

// ── src/collections/<id>.ts ─────────────────────────────────────────────────
writeNew(
  `src/collections/${id}.ts`,
  `/**
 * Colección \`${id}\` — [NOMBRE DE LA TIENDA].
 *
 * PRESENTACIÓN, no motor: identidad, copy y categorías del escaparate.
 * Nada de aquí influye en lo que se cobra, se envía o dice un email.
 */
import type { CollectionConfig } from './types';

export const ${id}Collection: CollectionConfig = {
  id: '${id}',
  themeId: '${id}',

  // TODO(tema ${id}): nombre y copy reales — proponer a Andreu antes de fijar.
  name: '${cap} (provisional)',
  tagline: 'TODO: una línea bajo el nombre',
  description: 'TODO: meta description del escaparate.',

  // TODO(tema ${id}): categorías reales del catálogo (los ids son los valores
  // de products.category en el seed y de ?categoria= en la URL).
  categories: [
    { id: '${ns}-categoria-1', label: 'Categoría 1' },
    { id: '${ns}-categoria-2', label: 'Categoría 2' },
  ],
};
`,
);

// ── seed/collections/<id>.ts ────────────────────────────────────────────────
writeNew(
  `seed/collections/${id}.ts`,
  `/**
 * Catálogo de la colección \`${id}\` — STUB de 3 productos.
 *
 * TODO(tema ${id}): sustituir por el catálogo real (ver reparto de productos en
 * docs/ROADMAP.md § 9B.0). Reglas:
 *  · slugs NAMESPACEADOS con «${ns}-» (slug es UNIQUE GLOBAL en D1);
 *  · \`category\` debe existir en src/collections/${id}.ts;
 *  · imagen: /images/collections/${id}/<slug>.webp (la resuelve el seed);
 *  · \`compare_at_price_cents\` es SOLO presentación y debe ser > price_cents.
 *
 * Gotcha: imports relativos con extensión .ts (corre bajo node type-stripping).
 */
import type { SeedProduct } from '../products.ts';

const c = (prod: Omit<SeedProduct, 'collection'>): SeedProduct => ({
  ...prod,
  collection: '${id}',
});

export const ${id}SeedProducts: readonly SeedProduct[] = [
  c({ slug: '${ns}-producto-1', name: 'Producto 1', description: 'TODO', price_cents: 1900, stock: 10, category: '${ns}-categoria-1' }),
  c({ slug: '${ns}-producto-2', name: 'Producto 2', description: 'TODO', price_cents: 2900, stock: 8, category: '${ns}-categoria-1' }),
  c({ slug: '${ns}-producto-3', name: 'Producto 3', description: 'TODO', price_cents: 4900, stock: 5, category: '${ns}-categoria-2' }),
];
`,
);

// ── Componentes del tema ────────────────────────────────────────────────────
const gridProductType = `type GridProduct = {
  slug: string;
  name: string;
  price_cents: number;
  image: string;
  stock: number;
};`;

writeNew(
  `src/components/themes/${id}/Catalog.astro`,
  `---
/**
 * ${cap.toUpperCase()} · Catalog — vista completa del catálogo del tema.
 * La monta la página de tienda a través del registro de vistas por tema.
 *
 * TODO(tema ${id}): REPLICAR la captura public/images/referencias/*-${id}.webp
 * (rejilla, gaps, filetes, escala tipográfica, orden). Ver docs/CHECKLIST_TEMA.md.
 */
import type { CollectionConfig } from '../../../lib/collections';
import Filters from './Filters.astro';
import ProductGrid from './ProductGrid.astro';

${gridProductType}

interface Props {
  products: GridProduct[];
  collection: CollectionConfig;
  category?: string | undefined;
  sort: string;
  search?: string | undefined;
}

const { products, collection, category, sort, search } = Astro.props;
---

{/* Gotcha: el <body> de Base lleva bg-white fijo — superficie dark-aware aquí. */}
<main class="bg-background px-5 py-8 md:px-8">
  <Filters collection={collection} count={products.length} activeCategory={category} sort={sort} search={search} />
  <div class="mt-8">
    {products.length > 0 ? (
      <ProductGrid products={products} />
    ) : (
      <div class="py-20 text-center">
        <p class="font-display text-lg text-foreground">
          {search ? \`Nada por aquí para «\${search}»\` : 'No hay productos en esta categoría'}
        </p>
      </div>
    )}
  </div>
</main>
`,
);

writeNew(
  `src/components/themes/${id}/ProductGrid.astro`,
  `---
/**
 * ${cap.toUpperCase()} · ProductGrid — rejilla de producto del tema.
 *
 * TODO(tema ${id}): replicar la composición de la referencia. Reglas:
 *  · cero color/tamaño hardcodeado: leer tokens (--grid-gap, --surface-product,
 *    --radius-card, --border-width…);
 *  · botón de compra con data-attribute PROPIO (data-${id}-add) para no
 *    colisionar con el handler genérico de Base;
 *  · clases de Tailwind como literales (el escáner no ve clases dinámicas).
 */
${gridProductType}

interface Props {
  products: GridProduct[];
}

const { products } = Astro.props;

const fmt = (cents: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100);
---

<ul class="grid grid-cols-2 gap-[var(--grid-gap)] md:grid-cols-3">
  {products.map((p) => (
    <li>
      <a href={\`/demo/tienda/\${p.slug}\`} class="group block">
        <div class="overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-product)]">
          <img src={p.image} alt={p.name} loading="lazy" class="aspect-square w-full object-cover" />
        </div>
        <div class="mt-3 flex items-baseline justify-between gap-2">
          <span class="font-display text-sm text-foreground">{p.name}</span>
          <span class="text-sm text-muted-foreground">{fmt(p.price_cents)}</span>
        </div>
      </a>
    </li>
  ))}
</ul>
`,
);

writeNew(
  `src/components/themes/${id}/Filters.astro`,
  `---
/**
 * ${cap.toUpperCase()} · Filters — filtros del catálogo del tema.
 *
 * TODO(tema ${id}): darle la forma de la referencia (chips, sidebar, radios…).
 * Contrato: filtra contra los MISMOS parámetros ?categoria= / ?orden= / ?q=
 * de la tienda Base — la lógica de filtrado es motor, aquí solo cambia la piel.
 */
import type { CollectionConfig } from '../../../lib/collections';

interface Props {
  collection: CollectionConfig;
  count: number;
  activeCategory?: string | undefined;
  sort: string;
  search?: string | undefined;
}

const { collection, count, activeCategory } = Astro.props;
const base = '/demo/tienda';
---

<nav aria-label="Categorías" class="flex flex-wrap items-center gap-2">
  <span class="text-xs uppercase tracking-widest text-muted-foreground">Catálogo ({count})</span>
  <a
    href={base}
    aria-current={!activeCategory ? 'page' : undefined}
    class="rounded-[var(--radius-btn)] border-[length:var(--border-width)] border-border px-3 py-1 text-sm text-foreground aria-[current=page]:bg-brand aria-[current=page]:text-brand-fg"
  >Todo</a>
  {collection.categories.map((cat) => (
    <a
      href={\`\${base}?categoria=\${cat.id}\`}
      aria-current={activeCategory === cat.id ? 'page' : undefined}
      class="rounded-[var(--radius-btn)] border-[length:var(--border-width)] border-border px-3 py-1 text-sm text-foreground aria-[current=page]:bg-brand aria-[current=page]:text-brand-fg"
    >{cat.label}</a>
  ))}
</nav>
`,
);

writeNew(
  `src/components/themes/${id}/ProductDetail.astro`,
  `---
/**
 * ${cap.toUpperCase()} · ProductDetail — ficha de producto del tema.
 *
 * HOY la ficha la sirve Base para todos los temas (hereda tokens por CSS vars);
 * este componente existe para cuando el tema necesite redefinir su ESTRUCTURA.
 * Se cablea en la ruta de ficha (9B.4). Si con Base + tokens basta: bórralo y
 * anótalo en la ficha de entrega (docs/temas/${id}.md).
 */
interface Props {
  product: {
    slug: string;
    name: string;
    description: string;
    price_cents: number;
    image: string;
    stock: number;
    subtitle?: string | null;
    compare_at_price_cents?: number | null;
  };
}

const { product } = Astro.props;
---

{/* TODO(tema ${id}): estructura propia de ficha, o borrar este stub. */}
<article class="text-foreground">
  <h1 class="font-display">{product.name}</h1>
</article>
`,
);

// ── Carpeta de imágenes + ficha de entrega ──────────────────────────────────
writeNew(`public/images/collections/${id}/.gitkeep`, '');

writeNew(
  `docs/temas/${id}.md`,
  `# Tema ${id} — ficha de entrega

> Rellenar al cerrar la sesión del tema. Es la serie que prueba que la promesa
> comercial («solo diseño y productos») se sostiene — ver PROMPT_9B3.md § 4.

- **Referencia:** \`public/images/referencias/??-${id}.webp\` (mirarla SIEMPRE: réplica, no «inspirado en»)
- **Colección:** \`src/collections/${id}.ts\` — nombre de tienda confirmado por Andreu: ☐
- **Catálogo:** N productos (reparto de ROADMAP § 9B.0) · slugs \`${ns}-*\`
- **Imaginería:** ☐ generada (sesión LOCAL, receta de docs/TEMAS.md § 5) · ☐ optimizada a WebP

## Coste del tema (rellenar al cerrar)

- Ficheros tocados:
- ¿Hizo falta rozar el motor? (debe ser NO):
- Tiempo de sesión:

## Verificación (docs/CHECKLIST_TEMA.md)

- ☐ \`pnpm check\` en verde
- ☐ 1440px · 375px · modo oscuro (\`.dark\` forzada)
- ☐ Catálogo, ficha, carrito y checkout con el tema activo
- ☐ Contraste AA (ojo acentos claros: gotcha .text-brand)
`,
);

// ── Parches de registro (idempotentes) ──────────────────────────────────────
patchAtMarker(
  'src/lib/collections.ts',
  '// new-theme:imports',
  `import { ${id}Collection } from '../collections/${id}';`,
  `collections/${id}'`,
);
patchAtMarker(
  'src/lib/collections.ts',
  '// new-theme:entries',
  `${id}Collection,`,
  `${id}Collection,`,
);
patchAtMarker(
  'seed/collections/index.ts',
  '// new-theme:seed-imports',
  `import { ${id}SeedProducts } from './${id}.ts';`,
  `./${id}.ts'`,
);
patchAtMarker(
  'seed/collections/index.ts',
  '// new-theme:seed-entries',
  `...${id}SeedProducts,`,
  `...${id}SeedProducts,`,
);

// Entrada del tema en demo-themes.ts SOLO si falta (los 8 conocidos ya existen).
const themesSrc = readFileSync(join(root, 'src/lib/demo-themes.ts'), 'utf8');
if (!new RegExp(`id: '${id}'`).test(themesSrc)) {
  patchAtMarker(
    'src/lib/demo-themes.ts',
    '// new-theme:themes',
    `{
    id: '${id}',
    label: '${cap}',
    hint: 'TODO: una línea que venda el preset.',
    reference: null,
    sample: null,
    bestFor: ['TODO'],
    status: 'planned',
    vars: {
      // TODO(tema ${id}): tokens copiados de Base — sustituir por los del tema.
      '--color-brand': shopConfig.brand.color,
      '--color-brand-dark': shopConfig.brand.colorDark,
      '--color-brand-fg': '#ffffff',
      '--font-display': SYSTEM_SANS,
      '--font-accent': MONO,
      '--tracking-display': '-0.02em',
      '--weight-display': '600',
      '--radius-btn': '9999px',
      '--radius-card': '0.75rem',
      '--border-width': '1px',
      '--surface-product': '#f6f6f4',
      '--surface-sunken': '#fafafa',
      '--space-density': '1',
      '--grid-gap': '1.5rem',
    },
    layout: {
      gridCols: 4, gridStyle: 'uniform', nav: 'top', hero: 'none',
      card: 'plain', filters: 'chips', density: 'regular',
      annotations: false, darkFooter: false,
    },
  },`,
    `id: '${id}',`,
  );
} else {
  skipped.push(`src/lib/demo-themes.ts (tema '${id}' ya existe)`);
}

// ── Resumen ─────────────────────────────────────────────────────────────────
console.log(`\nScaffold del tema «${id}»`);
if (created.length) console.log('  creado:\n    ' + created.join('\n    '));
if (patched.length) console.log('  parcheado:\n    ' + patched.join('\n    '));
if (skipped.length) console.log('  ya existía (sin tocar):\n    ' + skipped.join('\n    '));
console.log(`
Siguientes pasos (docs/CHECKLIST_TEMA.md):
  1. Colección real en src/collections/${id}.ts (nombre → confirmar con Andreu)
  2. Catálogo real en seed/collections/${id}.ts (slugs ${ns}-*)
  3. Tokens del tema en src/lib/demo-themes.ts (mirando la captura)
  4. Componentes en src/components/themes/${id}/
  5. pnpm check && pnpm build && verificación en navegador
`);
