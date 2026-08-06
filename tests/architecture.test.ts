import { describe, expect, it } from 'vitest';
import shopConfigSource from '../shop.config.ts?raw';
import platformConfigSource from '../platform.config.ts?raw';
import architectureDebtSource from '../docs/plataforma/arquitectura/DEUDA.md?raw';
import {
  ARCHITECTURE_ALLOWLIST,
  R1_1_BASELINE_EXCEPTION_KEYS,
  type ArchitectureRule,
} from './architecture-allowlist';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.astro'] as const;

type ModuleName =
  | 'platform/configuration'
  | 'platform/security'
  | 'platform/operations'
  | 'catalog'
  | 'pricing'
  | 'inventory'
  | 'cart'
  | 'checkout'
  | 'payments'
  | 'orders'
  | 'fulfillment'
  | 'customers'
  | 'notifications'
  | 'integrations'
  | 'storefront'
  | 'marketing'
  | 'demo-support'
  | 'shared-kernel';

const LEGACY_MODULES: Readonly<Record<string, ModuleName>> = {
  'src/lib/admin-auth.ts': 'platform/security',
  'src/lib/backup.ts': 'platform/operations',
  'src/lib/cart-client.ts': 'cart',
  'src/lib/contact.ts': 'marketing',
  'src/lib/csv.ts': 'shared-kernel',
  'src/lib/db.ts': 'catalog',
  'src/lib/demo-catalog.ts': 'demo-support',
  'src/lib/demo-commerce.ts': 'demo-support',
  'src/lib/demo-themes.ts': 'storefront',
  'src/lib/theme-catalog.ts': 'storefront',
  'src/lib/emails.ts': 'notifications',
  'src/lib/format.ts': 'shared-kernel',
  'src/lib/nav.ts': 'storefront',
  'src/lib/not-found.ts': 'storefront',
  'src/lib/order-transitions.ts': 'orders',
  'src/lib/orders.ts': 'orders',
  'src/lib/payment-mode.ts': 'payments',
  'src/lib/pricing.ts': 'pricing',
  'src/lib/quote.ts': 'checkout',
  'src/lib/rate-limit.ts': 'platform/security',
  'src/lib/send-email.ts': 'notifications',
  'src/lib/shipping.ts': 'fulfillment',
  'src/lib/storefront-contract.ts': 'demo-support',
  'src/lib/stripe.ts': 'integrations',
  'src/lib/thanks.ts': 'orders',
};

const ALLOWED_MODULE_DEPENDENCIES: Readonly<Record<ModuleName, readonly ModuleName[]>> = {
  'platform/configuration': ['shared-kernel'],
  'platform/security': ['shared-kernel', 'platform/configuration'],
  'platform/operations': ['shared-kernel', 'platform/configuration'],
  catalog: ['shared-kernel', 'platform/configuration'],
  pricing: ['shared-kernel', 'platform/configuration', 'catalog'],
  inventory: ['shared-kernel', 'platform/configuration', 'catalog'],
  cart: ['shared-kernel', 'catalog'],
  checkout: ['shared-kernel', 'platform/configuration', 'cart', 'catalog', 'pricing', 'inventory', 'fulfillment', 'customers', 'payments', 'orders'],
  payments: ['shared-kernel', 'platform/configuration'],
  orders: ['shared-kernel', 'platform/configuration', 'catalog', 'pricing', 'customers'],
  fulfillment: ['shared-kernel', 'platform/configuration', 'orders', 'inventory'],
  customers: ['shared-kernel', 'platform/configuration'],
  notifications: ['shared-kernel', 'platform/configuration'],
  integrations: ['shared-kernel', 'platform/configuration', 'catalog', 'inventory', 'payments', 'orders', 'fulfillment', 'customers', 'notifications', 'marketing'],
  storefront: ['shared-kernel', 'platform/configuration', 'catalog', 'cart', 'checkout', 'orders'],
  marketing: ['shared-kernel', 'platform/configuration', 'customers', 'notifications'],
  'demo-support': ['shared-kernel', 'platform/configuration', 'catalog', 'pricing', 'inventory', 'cart', 'checkout', 'fulfillment', 'storefront'],
  'shared-kernel': [],
};

const LEGACY_DOMAIN_FILES = new Set([
  'src/lib/order-transitions.ts',
  'src/lib/pricing.ts',
  'src/lib/shipping.ts',
]);

const FORBIDDEN_DOMAIN_IMPORT = /^(?:astro(?::|\/)|@astrojs\/|@cloudflare\/|stripe(?:\/|$)|resend(?:\/|$)|wrangler(?:\/|$))/;
const FORBIDDEN_DOMAIN_GLOBAL =
  /\b(?:D1Database|D1PreparedStatement|ExecutionContext|ScheduledController|AstroGlobal|APIRoute|Request|Response|Headers|fetch)\b/;
const RESTRICTED_SDK_IMPORT = /^(?:stripe(?:\/|$)|resend(?:\/|$))/;
const IMPORT_PATTERN = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

type ImportEdge = { source: string; specifier: string; target: string | null };
type Violation = { file: string; rule: ArchitectureRule; detail: string };

const rawSourceModules = import.meta.glob('../src/**/*.{ts,tsx,js,mjs,astro}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const sourceByProjectPath = new Map<string, string>([
  ...Object.entries(rawSourceModules).map(([file, source]) => [file.replace(/^\.\.\//, ''), source] as const),
  ['shop.config.ts', shopConfigSource],
  ['platform.config.ts', platformConfigSource],
]);

function normalizePath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') segments.pop();
    else segments.push(segment);
  }
  return segments.join('/');
}

function importsIn(file: string): { specifier: string; target: string | null }[] {
  const source = sourceByProjectPath.get(file) ?? '';
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => {
    const captured = match[1] ?? match[2];
    if (!captured) throw new Error(`Import sin specifier en ${file}`);
    const specifier = captured.split('?')[0];
    if (!specifier) throw new Error(`Import vacío en ${file}`);
    return { specifier, target: resolveImport(file, specifier) };
  });
}

function resolveImport(source: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const sourceDirectory = source.split('/').slice(0, -1).join('/');
  const raw = normalizePath(`${sourceDirectory}/${specifier}`);
  const candidates = [
    raw,
    ...SOURCE_EXTENSIONS.map((extension) => `${raw}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => `${raw}/index${extension}`),
  ];
  return candidates.find((candidate) => sourceByProjectPath.has(candidate)) ?? null;
}

const importEdges: ImportEdge[] = [...sourceByProjectPath.keys()].flatMap((file) =>
  importsIn(file).map(({ specifier, target }) => ({ source: file, specifier, target })),
);

function moduleOf(file: string): ModuleName | null {
  if (file === 'shop.config.ts' || file === 'platform.config.ts') return 'platform/configuration';
  const legacy = LEGACY_MODULES[file];
  if (legacy) return legacy;
  if (file.startsWith('src/shared-kernel/')) return 'shared-kernel';
  if (file.startsWith('src/integrations/')) return 'integrations';
  if (file.startsWith('src/collections/')) return 'storefront';
  const platform = file.match(/^src\/platform\/(configuration|security|operations)\//)?.[1];
  if (platform) return `platform/${platform}` as ModuleName;
  const module = file.match(/^src\/modules\/([^/]+)\//)?.[1];
  return module as ModuleName | null;
}

function layerOf(file: string): 'domain' | 'application' | 'infrastructure' | 'presentation' | null {
  return (file.match(/\/(domain|application|infrastructure|presentation)\//)?.[1] ?? null) as
    | 'domain'
    | 'application'
    | 'infrastructure'
    | 'presentation'
    | null;
}

function keyOf(item: { file: string; rule: ArchitectureRule }): string {
  return `${item.rule}:${item.file}`;
}

function documentedOwner(owner: string): string {
  if (owner === 'architecture') return 'arquitectura';
  return owner.replaceAll('-', '/');
}

function findViolations(): Violation[] {
  const violations: Violation[] = [];
  const add = (file: string, rule: ArchitectureRule, detail: string): void => {
    if (!violations.some((item) => item.file === file && item.rule === rule)) violations.push({ file, rule, detail });
  };

  for (const file of sourceByProjectPath.keys()) {
    const source = sourceByProjectPath.get(file) ?? '';
    const imports = importEdges.filter((edge) => edge.source === file);
    const domainFile = LEGACY_DOMAIN_FILES.has(file) || file.includes('/domain/');

    if (domainFile) {
      for (const edge of imports) {
        if (FORBIDDEN_DOMAIN_IMPORT.test(edge.specifier)) add(file, 'domain-technology-import', edge.specifier);
      }
      if (FORBIDDEN_DOMAIN_GLOBAL.test(source)) add(file, 'domain-platform-global', 'global de plataforma');
    }

    if (file === 'src/lib/demo-catalog.ts' && imports.some((edge) => edge.specifier.startsWith('../../seed/'))) {
      add(file, 'legacy-inverted-import', 'runtime -> seed');
    }

    if (file.startsWith('src/pages/') && /\.(?:prepare|batch|exec)\s*\(/.test(source)) {
      add(file, 'presentation-sql', 'D1/SQL en presentación');
    }

    for (const edge of imports) {
      if (
        RESTRICTED_SDK_IMPORT.test(edge.specifier) &&
        file !== 'src/lib/stripe.ts' &&
        !file.startsWith('src/integrations/')
      ) {
        add(file, 'restricted-sdk-import', edge.specifier);
      }

      if (!edge.target) continue;
      const sourceModule = moduleOf(file);
      const targetModule = moduleOf(edge.target);
      if (!sourceModule || !targetModule || sourceModule === targetModule) continue;
      if (layerOf(file) === 'domain' && targetModule !== 'shared-kernel') {
        add(file, 'layer-direction', `domain -> ${targetModule}`);
      }
      if (!ALLOWED_MODULE_DEPENDENCIES[sourceModule]?.includes(targetModule)) {
        add(file, 'module-dependency', `${sourceModule} -> ${targetModule}`);
      }

      if (file.startsWith('src/modules/') && edge.target.startsWith('src/modules/')) {
        const targetRoot = `src/modules/${edge.target.split('/')[2]}`;
        if (edge.target !== `${targetRoot}/index.ts`) add(file, 'module-private-import', edge.target);
      }
    }

    const layer = layerOf(file);
    if (!layer) continue;
    for (const edge of imports) {
      if (!edge.target || moduleOf(file) !== moduleOf(edge.target)) continue;
      const targetLayer = layerOf(edge.target);
      const forbidden =
        (layer === 'domain' && targetLayer !== null && targetLayer !== 'domain') ||
        (layer === 'application' && (targetLayer === 'infrastructure' || targetLayer === 'presentation')) ||
        (layer === 'infrastructure' && targetLayer === 'presentation') ||
        (layer === 'presentation' && (targetLayer === 'infrastructure' || targetLayer === 'domain'));
      if (forbidden) add(file, 'layer-direction', `${layer} -> ${targetLayer}`);
    }
  }

  return violations.toSorted((a, b) => keyOf(a).localeCompare(keyOf(b)));
}

function findCycles(): string[][] {
  const graph = new Map<string, string[]>();
  for (const file of sourceByProjectPath.keys()) graph.set(file, []);
  for (const edge of importEdges) {
    if (edge.target && graph.has(edge.target)) graph.get(edge.source)?.push(edge.target);
  }

  const cycles: string[][] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const seen = new Set<string>();
  const visit = (node: string): void => {
    if (state.get(node) === 'done') return;
    if (state.get(node) === 'visiting') {
      const start = stack.indexOf(node);
      const cycle = [...stack.slice(start), node];
      const signature = [...new Set(cycle)].toSorted().join('|');
      if (!seen.has(signature)) {
        seen.add(signature);
        cycles.push(cycle);
      }
      return;
    }
    state.set(node, 'visiting');
    stack.push(node);
    for (const target of graph.get(node) ?? []) visit(target);
    stack.pop();
    state.set(node, 'done');
  };
  for (const node of graph.keys()) visit(node);
  return cycles;
}

describe('architecture boundaries (R1.1)', () => {
  it('classifies every legacy src/lib file so new flat modules cannot appear silently', () => {
    const libFiles = [...sourceByProjectPath.keys()].filter((file) => file.startsWith('src/lib/') && file.endsWith('.ts'));
    expect(libFiles.filter((file) => !(file in LEGACY_MODULES))).toEqual([]);
  });

  it('accepts only module names present in the approved dependency map', () => {
    const targetModules = [...sourceByProjectPath.keys()]
      .map((file) => file.match(/^src\/modules\/([^/]+)\//)?.[1])
      .filter((module): module is string => module !== undefined);
    expect(targetModules.filter((module) => !(module in ALLOWED_MODULE_DEPENDENCIES))).toEqual([]);
  });

  it('keeps the allowlist exact, documented and non-expandable', () => {
    const baseline = new Set<string>(R1_1_BASELINE_EXCEPTION_KEYS);
    const keys = ARCHITECTURE_ALLOWLIST.map(keyOf);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((key) => !baseline.has(key))).toEqual([]);
    expect(ARCHITECTURE_ALLOWLIST.length).toBeLessThanOrEqual(R1_1_BASELINE_EXCEPTION_KEYS.length);
    for (const exception of ARCHITECTURE_ALLOWLIST) {
      expect(exception.file).toMatch(/^src\/.+\.(?:ts|astro)$/);
      expect(exception.file).not.toMatch(/[*!{}]/);
      expect(sourceByProjectPath.has(exception.file)).toBe(true);
      expect(exception.reason.trim().length).toBeGreaterThan(20);
      expect(exception.owner.trim().length).toBeGreaterThan(2);
      expect(exception.removalBlock).toMatch(/^R\d+(?:\.\d+)?$/);
      const documentedLine = architectureDebtSource
        .split('\n')
        .find((line) => line.startsWith(`| \`${exception.file}\` | \`${exception.rule}\` |`));
      expect(documentedLine).toBeDefined();
      expect(documentedLine).toContain(`| ${documentedOwner(exception.owner)} | ${exception.removalBlock} |`);
    }
  });

  it('matches observed violations exactly: no new debt and no stale exceptions', () => {
    const observed = findViolations().map(keyOf);
    const allowed = ARCHITECTURE_ALLOWLIST.map(keyOf).toSorted();
    expect(observed).toEqual(allowed);
  });

  it('has no cycles in resolvable static imports under src', () => {
    expect(findCycles()).toEqual([]);
  });
});
