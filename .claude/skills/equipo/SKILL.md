---
name: equipo
description: >
  El equipo de 7 roles de LogicEcom (arquitecto, fullstack, backend, product,
  frontend, ux-ui, seo). Usar SIEMPRE al arrancar cualquier tarea sustantiva de
  este repo — diseño, código, contenido, precios o documentación — y también
  cuando el usuario pida una revisión, mencione un rol («como arquitecto…»,
  «revisa el SEO»), o haya que tomar una decisión de producto, arquitectura o
  interfaz. Carga los roles afectados y cierra cada entrega con su sign-off.
---

# El equipo de LogicEcom

Este proyecto se desarrolla como si lo hiciera un equipo senior de 7 personas.
No son personajes: son **7 listas de responsabilidades y vetos** que evitan que
una sesión centrada en (p. ej.) maquetar una sección rompa el motor, el SEO o
el posicionamiento de producto sin darse cuenta.

## Cómo trabajar

1. **Al arrancar una tarea**, identifica qué superficies toca y lee los roles
   afectados de `roles/` (tabla de abajo). Para tareas transversales (una
   fase entera, la landing, precios) lee al menos: arquitecto + product + el
   especialista de la superficie.
2. **Durante el trabajo**, cada rol manda en su dominio. Si dos roles chocan
   (p. ej. UX quiere motion y SEO quiere peso cero), la jerarquía de desempate
   es la del proyecto: principios de `CLAUDE.md` §2 > producto vendible >
   estética. Si el conflicto es real y con impacto, se documenta y se pregunta
   a Andreu — nunca se resuelve en silencio.
3. **Al cerrar**, incluye en el resumen un **sign-off del consejo**: una línea
   por rol afectado (✓ o ⚠ con el porqué). Un ⚠ sin resolver va al ROADMAP o
   se pregunta; no se entierra.
4. Los vetos de cada rol (sección «Vetos» de su fichero) son **paradas
   obligatorias**: si el trabajo activa uno, se para y se consulta antes de
   seguir, igual que manda `CLAUDE.md` §14.

## Los roles

| Rol | Fichero | Manda sobre | Léelo cuando toques… |
|---|---|---|---|
| Arquitecto de software | `roles/arquitecto.md` | Fronteras motor/colección, esquema D1, dependencias, coste 0 € | migraciones, `src/lib/`, APIs, `wrangler.jsonc`, cualquier dependencia |
| Fullstack (visión global) | `roles/fullstack.md` | Coherencia extremo a extremo, contratos API, tests, clonabilidad | cualquier cambio que cruce cliente/servidor o toque ≥2 capas |
| Backend | `roles/backend.md` | Dinero, stock, webhook, seguridad, datos | pricing, checkout, webhook, admin APIs, seed, emails |
| Product designer | `roles/product.md` | Qué se construye y por qué; ICP; precios; alcance | landing, dossier, precios, features nuevas, docs de cliente |
| Frontend | `roles/frontend.md` | Funcionalidad de la interfaz, islands, estados, rendimiento cliente | `src/pages/`, `src/components/`, JS de cliente, formularios |
| UX / UI | `roles/ux-ui.md` | Sistema visual Logic2B UI, accesibilidad, motion, responsive | cualquier pantalla, tema, token, animación |
| SEO | `roles/seo.md` | Indexación, datos estructurados, CWV, copy que posiciona | landing, `/arquitectura`, `/estilos`, fichas, metas, contenido |

## Sign-off del consejo — formato

Al final del resumen de una entrega:

```
Consejo: arquitecto ✓ · backend ✓ · frontend ✓ · ux-ui ⚠ contraste del chip
pendiente de verificar en dark · seo ✓ · product n/a · fullstack ✓
```

Solo los roles afectados; `n/a` para los que no tocan. Un ⚠ lleva siempre su
motivo en ≤10 palabras y su destino (arreglado ahora / ROADMAP / pregunta).
