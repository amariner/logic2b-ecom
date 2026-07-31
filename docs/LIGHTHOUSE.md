# Lighthouse — páginas indexables

> Generado por `node scripts/lighthouse.mjs --write` el 2026-07-30.
> Lighthouse 12.8.2, mediana de 3 pasadas contra https://ecom.logic2b.com.
> Las cifras de esta tabla son las que la landing y el dossier pueden citar.

| Página | Dispositivo | Rendimiento | Accesibilidad | Buenas prácticas | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| Landing | Móvil | 95 | 100 | 100 | 100 | 1.6 s | 0.00 | 124 ms |
| Landing | Escritorio | 98 | 100 | 100 | 100 | 0.6 s | 0.00 | 0 ms |
| Arquitectura | Móvil | 100 | 100 | 100 | 100 | 1.3 s | 0.00 | 0 ms |
| Arquitectura | Escritorio | 100 | 100 | 100 | 100 | 0.4 s | 0.00 | 0 ms |
| Estilos | Móvil | 100 | 100 | 100 | 100 | 1.4 s | 0.00 | 0 ms |
| Estilos | Escritorio | 100 | 100 | 100 | 100 | 0.5 s | 0.00 | 0 ms |
| Dossier | Móvil | 100 | 100 | 100 | 100 | 1.3 s | 0.00 | 0 ms |
| Dossier | Escritorio | 100 | 100 | 100 | 100 | 0.3 s | 0.00 | 0 ms |

Móvil es el perfil por defecto de Lighthouse (Moto G Power emulado, 4G
lenta con CPU 4× más lenta); escritorio usa el preset `desktop`. La
emulación móvil es deliberadamente pesimista: es el suelo, no la media.

Esta tabla la reescribe el script en cada `--write`. **El porqué de cada
nota que no sea 100 vive en el ROADMAP** (entradas F11.8c y F11.8d), no
aquí: lo que se escriba a mano en este fichero se pierde en la siguiente
tanda.
