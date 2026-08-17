# Suscripciones por adaptador

`PRC-013` instala un límite neutral para operar suscripciones sin acoplar el
motor a un proveedor. No es un plan comercial ni activa cobros recurrentes por
defecto.

## Qué cubre

- plan versionado y snapshot por alta;
- referencias remotas opacas;
- alta, activación, pausa, reanudación, cambio y cancelación;
- impago, reintentos observados y recuperación;
- eventos idempotentes y versión optimista;
- sesión de portal alojada, expirable y no persistida;
- API administrativa protegida por capacidad y demo read-only.

El adaptador simulado sirve para pruebas y clonación local. No habla con ningún
servicio ni cobra. Un adaptador real tendrá que autenticar cada webhook antes de
producir un hecho verificado.

## Estado y trazabilidad

```text
pending -> active <-> paused
             |
             +-> past_due -> active
             |
             +-> cancel_at_period_end -> cancelled
             +--------------------------> cancelled
```

El proveedor aporta hechos; el dominio decide si la transición es válida; D1
vuelve a comprobar estado, versión y pertenencia. La misma referencia de evento
solo puede procesarse una vez. El historial no contiene email ni payload remoto.

## Impago

`payment_failed` incrementa el contador y deja `past_due`.
`payment_succeeded` actualiza el ciclo y devuelve `active`. El motor no elige
cuántos reintentos hay, cuándo ocurren o cuándo se suspende: esa política debe
aprobarse por proyecto y permanecer en el proveedor/adaptador.

## Portal y seguridad

La API devuelve una URL alojada con `cache-control: no-store`, exige retorno al
mismo origen y no tiene tabla de sesiones ni URL guardada. R4.10 solo permite
crearla desde administración. Un portal para cliente requiere autenticación e
identidad R5.

No se almacena tarjeta, PAN, CVC ni método de pago. No existe webhook público
simulado. La demo pública no puede mutar planes o suscripciones.

## Límites actuales

- capacidad instalada pero no activa en presets;
- sin proveedor real, SDK, credencial o gasto;
- sin precios/cadencias de seed;
- sin autoservicio de cliente;
- sin creación automática de pedidos, stock o fulfillment por ciclo;
- sin política de dunning ni comunicaciones inventadas.

Decisión: [`../adr/0037-suscripciones-adaptador-verificado.md`](../adr/0037-suscripciones-adaptador-verificado.md).
Operación: [`../OPERACION_SUSCRIPCIONES.md`](../OPERACION_SUSCRIPCIONES.md).
