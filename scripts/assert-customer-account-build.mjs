import { access, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = resolve(import.meta.dirname, '..');
const distDirectory = resolve(projectRoot, 'dist');
const workerDirectory = resolve(distDirectory, '_worker.js');
const manifestFile = (await readdir(workerDirectory))
  .find((file) => /^manifest_[A-Za-z0-9_-]+\.mjs$/u.test(file));

if (manifestFile === undefined) {
  throw new Error('No se encontró el manifest del build para verificar la cuenta.');
}

const manifestUrl = pathToFileURL(resolve(workerDirectory, manifestFile));
manifestUrl.searchParams.set('customer-account-assertion', Date.now().toString());
const imported = await import(manifestUrl.href);
const manifest = imported.manifest;
const scriptEntry = Object.entries(manifest.entryModules).find(([id]) =>
  id.includes('/src/pages/cuenta/acceso/confirmar.astro?astro&type=script&index=0'),
);

if (scriptEntry === undefined) {
  throw new Error('El build no registró el módulo de confirmación passwordless.');
}

const [scriptId, assetPath] = scriptEntry;
if (manifest.inlinedScripts.has(scriptId)) {
  throw new Error('El build embebió JavaScript inline en la confirmación passwordless.');
}
if (typeof assetPath !== 'string' || !assetPath.startsWith('_astro/') || !assetPath.endsWith('.js')) {
  throw new Error('La confirmación passwordless no apunta a un asset JS first-party.');
}

const absoluteAssetPath = resolve(distDirectory, assetPath);
await access(absoluteAssetPath);
const clientCode = await readFile(absoluteAssetPath, 'utf8');
if (!clientCode.includes('replaceState') || !clientCode.includes('/cuenta/acceso/confirmar')) {
  throw new Error('El asset de confirmación no contiene la limpieza de fragmento esperada.');
}

console.log(`customer-account: módulo externo verificado (${assetPath})`);
