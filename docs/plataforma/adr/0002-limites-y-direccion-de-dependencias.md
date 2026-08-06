# ADR-0002 — Límites y dirección de dependencias

- Estado: **accepted**
- Fecha: 2026-08-06
- Mandato: R1.1

## Contexto

El árbol plano mezcla dominio, D1, Astro, SDKs, fixtures y composición. R1.2 no
puede definir capacidades si no sabe qué activa y qué módulo posee cada dato.

## Decisión

Adoptar los módulos y propiedad lógica de
[`arquitectura/README.md`](../arquitectura/README.md#3-mapa-objetivo). Dentro de
cada módulo, `presentation -> application -> domain`; infraestructura implementa
puertos internos. El dominio solo depende de su propio dominio y del
`shared-kernel`. Entre módulos solo se importa el `index.ts` público y las
dependencias deben seguir el grafo aprobado.

## Alternativas consideradas

- Capas globales (`controllers/services/repositories`): rechazadas; agrupan por
  técnica y facilitan cruces entre dominios.
- Shared-kernel amplio: rechazado; se convierte en módulo dios.
- Imports directos entre infraestructuras: rechazados; atan proveedores y datos.

## Consecuencias

Habrá DTOs explícitos y algo de traducción. A cambio, precio, stock, pedido y
PSP pueden evolucionar sin hacer público D1 o Stripe.

## Invariantes

- Domain no importa Astro, Cloudflare, D1, Stripe, Resend, rutas ni HTTP.
- Dinero usa céntimos; cart no decide precio; inventory no confirma pago.
- Orders no envía emails ni payments muta pedidos directamente.
- Shared-kernel no lee configuración ni realiza I/O.

## Deuda conocida

Las inversiones y SQL exactos están en `arquitectura/DEUDA.md`. La allowlist no
autoriza nuevas instancias.

## Señal de revisión

Un ciclo inevitable entre APIs públicas, demostrado con dos casos de uso reales
y no resoluble mediante DTO/puerto/evento, obliga a un ADR sucesor. No se añade
una excepción silenciosa.
