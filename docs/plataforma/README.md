# Plataforma Logic2B Ecommerce

> Fuente de verdad de la evolución posterior al MVP. Esta carpeta convierte la
> visión «backend mínimo, capacidad máxima» en trabajo verificable por sesiones.

## La tesis

Logic2B Ecommerce no es un SaaS multiinquilino ni un panel universal. Cada
cliente recibe un despliegue aislado, una base sólida y únicamente los módulos
que necesita. La amplitud de la plataforma se conserva en el código compartido,
los contratos y los conectores; la complejidad que ve cada comercio se mantiene
proporcional a su negocio.

La paridad de capacidad no significa copiar todos los productos de una gran
plataforma. Significa poder resolver el mismo resultado comercial por una de
estas cuatro vías:

1. **Núcleo nativo**: imprescindible para toda tienda y mantenido por Logic2B.
2. **Módulo activable**: código compartido que solo se habilita donde aporta.
3. **Conector**: integración con un especialista externo mediante un contrato
   estable, observable y sustituible.
4. **Servicio gestionado**: operación o desarrollo a medida que no debe
   convertirse en configuración permanente del panel.

Una quinta clasificación, **fuera de alcance deliberado**, evita confundir
paridad comercial con fabricar bancos, redes publicitarias, hardware de punto de
venta o servicios logísticos propios.

## Documentos

- [`INVESTIGACION_EDICIONES_2022_2026.md`](INVESTIGACION_EDICIONES_2022_2026.md):
  lectura de las nueve ediciones, tendencias y consecuencias para el producto.
- [`MATRIZ_CAPACIDADES.md`](MATRIZ_CAPACIDADES.md): inventario canónico de
  dominios, capacidades, forma de entrega, prioridad y estado real.
- [`ROADMAP.md`](ROADMAP.md): orden de ejecución por bloques de una sesión,
  dependencias y criterios de cierre.
- [`WIKI_SEO.md`](WIKI_SEO.md): arquitectura editorial y técnica de la futura
  wiki pública de funcionalidades.
- [`arquitectura/README.md`](arquitectura/README.md): inventario real, mapa de
  módulos, dependencias permitidas y transición incremental fijados en R1.1.
- [`arquitectura/DEUDA.md`](arquitectura/DEUDA.md): allowlist exacta y bloques
  responsables de eliminarla.
- [`adr/`](adr/): decisiones aceptadas de arquitectura modular.
- [`wiki/arquitectura-modular-ecommerce.md`](wiki/arquitectura-modular-ecommerce.md):
  borrador interno, no indexable, de la futura página de arquitectura.
- [`../../platform.config.ts`](../../platform.config.ts): manifest del
  despliegue actual, basado en un preset técnico y sin valores secretos.
- [`../../src/platform/configuration/`](../../src/platform/configuration/):
  contrato ejecutable de estados, flags, dependencias, config y presets R1.2.

## Reglas de verdad

- El estado de una capacidad lo manda `MATRIZ_CAPACIDADES.md`, no el copy.
- La próxima sesión la manda la sección «Siguiente bloque» de `ROADMAP.md`.
- Una página pública nunca puede decir «disponible» si no existe una prueba
  automatizada y una ruta operativa real.
- «Integrable» exige contrato, tratamiento de errores, reintentos, trazabilidad
  y procedimiento de desconexión; una mención comercial no basta.
- «A medida» describe una capacidad de servicio, no una función ya construida.
- Cada módulo nuevo debe poder permanecer desactivado sin añadir navegación,
  tablas inútiles, JavaScript ni carga cognitiva a un cliente que no lo use.

## Identificadores y estados

Cada capacidad usa un identificador estable `DOM-NNN`, por ejemplo `ORD-010`.
Los estados permitidos son:

| Estado | Significado verificable |
|---|---|
| `actual` | Funciona hoy en el motor real y está cubierto por pruebas. |
| `parcial` | Existe una base útil, pero falta parte del resultado prometido. |
| `especificado` | Contrato y criterios escritos; aún no debe venderse como disponible. |
| `pendiente` | Capacidad identificada, todavía sin especificación ejecutable. |
| `conector` | Se resuelve integrando un proveedor; requiere adaptador operativo. |
| `gestionado` | Lo ejecuta el equipo como servicio o desarrollo por proyecto. |
| `excluido` | No se construirá como producto propio salvo nueva decisión estratégica. |

## Definición de paridad

La plataforma alcanza paridad para un caso de negocio cuando se cumplen las
cinco condiciones siguientes:

1. El resultado se resuelve de extremo a extremo por una vía documentada.
2. Dinero, stock, impuestos y permisos se deciden en servidor.
3. Existe recuperación ante duplicados, fallos parciales y reintentos.
4. El comercio solo ve las acciones que realmente necesita.
5. La wiki explica con precisión qué hace Logic2B, qué hace un tercero y qué se
   configura a medida.

La cantidad bruta de botones o ajustes nunca es una métrica de paridad.
