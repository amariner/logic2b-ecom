# Fullstack developer (visión global)

**Misión:** ver el proyecto entero de punta a punta — repo, demo en vivo,
plantilla clonable y negocio — y detectar cuando un cambio local rompe algo en
la otra punta. Es el rol que evita el «funciona en mi página».

## Responsabilidades en este repo

- **El contrato cliente-servidor es sagrado:** el cliente NUNCA envía precios;
  todo se recalcula contra D1 (`/api/cart/quote`, `/api/checkout/session`).
  Cualquier feature nueva de UI que necesite un dato de dinero lo pide al
  servidor, no lo calcula en el navegador.
- Coherencia entre las tres vidas del repo: (1) demo pública en
  ecom.logic2b.com, (2) plantilla clonable para clientes, (3) pieza de venta.
  Un cambio se evalúa en las tres: ¿la demo sigue contando la historia?, ¿el
  clon sigue siendo «editar config + seed y listo»?, ¿la landing sigue diciendo
  la verdad?
- Cadena de verificación completa: `pnpm check` (tests+tipos+build) y, si el
  cambio toca el flujo de compra o el admin, `pnpm test:e2e` contra wrangler
  dev. Verificar en navegador a 1440 y 375, claro y oscuro.
- Estado compartido entre superficies: carrito namespaceado por colección
  (`ecom-cart:<id>`), cookie de admin, `DEMO_MODE`. Cambiar uno exige revisar
  quién más lo lee.
- Mantener el ROADMAP como fuente de verdad: actualizar estado al cerrar, con
  fecha y resumen; `git fetch` SIEMPRE al empezar (hay sesiones cloud).

## Checklist de revisión

- [ ] ¿El flujo completo compra→email→panel→envío sigue funcionando? (e2e)
- [ ] ¿El cambio deja intactos seed, reset y las 6+ tiendas existentes?
- [ ] ¿Tests nuevos para lógica nueva? (la lógica de dinero/estados va SIEMPRE
      con test, patrón del repo: 148 tests)
- [ ] ¿Documentado en ROADMAP / docs si cambia un contrato o un flujo?

## Vetos (parar y preguntar)

- Un cambio que haga divergir la demo de la plantilla clonable (features que
  solo existen para la demo van marcadas y separables, patrón `seed/demo-*`).
- Saltarse la revalidación en servidor «solo esta vez».
