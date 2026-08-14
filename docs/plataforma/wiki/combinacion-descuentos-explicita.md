# Combinación de descuentos explícita

## Qué resuelve hoy

Logic2B puede combinar un código, una campaña automática y una oferta de
cantidad/X-Y solo cuando una política activa permite cada par de fuentes y de
clases. La política fija contexto, prioridad y un tope sobre el precio base.
Cada presupuesto explica fuentes elegidas, exclusiones y truncamientos; el
pedido congela el mismo desglose.

Sin política, nada cambia: un código elegible conserva precedencia y solo una
campaña automática o de cantidad puede aplicarse. Esta ausencia segura evita
que añadir configuración o código nuevo cree un descuento doble accidental.

## Evidencia operativa

- motor puro y determinista para selección y cálculo aditivo;
- matriz versionada administrable por API autenticada;
- snapshot por línea `schema: 2` con importe bruto/aplicado por regla;
- guarda D1 para pares, clases, versiones, suma y tope;
- uso concurrente del código por su importe propio;
- aplicación combinada canónica por pedido;
- backup/restore esquema 23 y precio congelado en edición/devolución.

## Límites honestos

No hay editor visual. `shipping` está representado como clase para evitar una
extensión incompatible, pero ninguna fuente actual descuenta portes. No hay
segmentos, listas de precios, empresas/contratos ni tarjetas regalo; pertenecen
a bloques posteriores. La demo pública no crea políticas ni pedidos reales.
