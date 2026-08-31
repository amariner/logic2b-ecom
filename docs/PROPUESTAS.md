# Propuestas comerciales privadas

## Propósito

`/propuestas` es un carril independiente para demos personalizadas de posibles clientes. No es un catálogo de temas, no forma parte del escaparate público y nunca convierte esta instalación en el comercio real del destinatario.

Solo se abre una empresa por orden explícita de Andreu. Las propuestas no entran en la cola de temas, en `docs/ROADMAP_MEJORA_TEMAS.md` ni en el desarrollo autónomo general. Una propuesta tampoco autoriza contacto comercial, gasto, credenciales, precios o promesas de servicio.

## Contrato

- Cada propuesta vive en `src/proposals/<id>` y se registra en `src/proposals/index.ts`.
- Su identificador público tiene la forma `<id>-<32 caracteres hexadecimales>` y no contiene información sensible aparte del id interno.
- Estados: `draft`, `active` y `archived`. `draft` solo es visible en desarrollo; en producción responde 404. `archived` y una caducidad vencida responden 410.
- `/propuestas` no tiene página índice. No se enlaza desde navegación, temas ni sitemap.
- Todo HTML lleva `noindex,nofollow,noarchive`, `X-Robots-Tag`, `Referrer-Policy: no-referrer` y caché privada sin almacenamiento. Los activos estáticos conservan el versionado y caché de Cloudflare.
- Tienda y gestor son simulaciones locales: no usan APIs de comercio, D1, pagos, stock, login ni envío de emails.
- El único efecto externo permitido es el formulario de reunión ya existente, mediante `/api/contact` y un `source=proposal:<id>` explícito.

## Crear una propuesta

```bash
pnpm new:proposal empresa
```

El comando crea, sin sobrescribir, configuración en borrador, catálogo, fixtures, landing, documentación y directorio de imágenes. También registra la propuesta mediante marcadores estables. Una segunda ejecución no modifica los archivos ya creados.

Antes de pasar `status` a `active` deben estar completos catálogo, activos locales, avisos de demo, tests, QA móvil/desktop y revisión de contenido. La activación no envía ni anuncia la URL.

## Importadores

Los adaptadores de fuentes públicas se ejecutan manualmente. Nunca se importan datos durante build o runtime. Un refresh debe conservar precios demo por código, generar un diff revisable y mantener imágenes locales optimizadas; no se permite hotlinking.

## Exportación

Una propuesta puede servir como base para un proyecto aislado si la empresa se convierte en cliente. La exportación debe sustituir fixtures, precios y stock, incorporar los contratos reales y desplegarse fuera del carril `/propuestas`. No se activa comercio real dentro de `ecom.logic2b.com`.
