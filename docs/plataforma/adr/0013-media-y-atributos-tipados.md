# ADR-0013 — Media de producto y atributos tipados

- Estado: **accepted; puerta de esquema aprobada por Andreu**
- Fecha: 2026-08-10
- Mandato: R2.5

## Contexto

El catálogo canónico ya separa producto editorial, variante vendible, opciones
y combinaciones. La presentación sigue reducida a `products.image` y los datos
técnicos a `products.specs_json`: ambos contratos son útiles como fallback,
pero no pueden expresar una galería ordenada, foco de recorte, media específica
de una variante ni valores validados por tipo.

R2.5 debe ampliar el agregado sin convertir D1 en una biblioteca de binarios,
sin adelantar la taxonomía normalizada de CAT-006 y sin romper un clon cuyo
seed todavía use el formato v1. CAT-008 pertenece al núcleo de catálogo;
CAT-007 continúa siendo un módulo activable. Que una capacidad sea núcleo no
obliga a mostrarla en todos los presets.

## Decisión

Crear cuatro tablas aditivas:

1. `product_media` describe el uso editorial de una ruta o clave de asset.
2. `product_variant_media` selecciona y reordena media del mismo producto para
   una variante.
3. `attribute_definitions` declara atributos por colección y, opcionalmente,
   por categoría legacy.
4. `product_attribute_values` guarda exactamente un valor tipado por definición
   y ámbito de producto o variante.

No se almacenan binarios, dimensiones derivadas ni metadatos reutilizables en
D1; eso pertenece a CAT-009. Tampoco se crea todavía una tabla de categorías:
`attribute_definitions.category` usa el string legacy y `''` significa «toda
la colección» hasta CAT-006.

### SQL exacto aprobado

El siguiente SQL es el contrato aprobado para `0008`.

```sql
CREATE TABLE product_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  source TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 500),
  alt_text TEXT NOT NULL CHECK (length(trim(alt_text)) BETWEEN 1 AND 240),
  focal_x_bps INTEGER NOT NULL DEFAULT 5000
    CHECK (typeof(focal_x_bps) = 'integer' AND focal_x_bps BETWEEN 0 AND 10000),
  focal_y_bps INTEGER NOT NULL DEFAULT 5000
    CHECK (typeof(focal_y_bps) = 'integer' AND focal_y_bps BETWEEN 0 AND 10000),
  position INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(position) = 'integer' AND position >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (id, product_id),
  UNIQUE (product_id, position)
);

CREATE INDEX idx_product_media_product
  ON product_media(product_id, position, id);

CREATE TABLE product_variant_media (
  variant_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(position) = 'integer' AND position >= 0),
  PRIMARY KEY (variant_id, media_id),
  UNIQUE (variant_id, position),
  FOREIGN KEY (variant_id, product_id)
    REFERENCES product_variants(id, product_id) ON DELETE CASCADE,
  FOREIGN KEY (media_id, product_id)
    REFERENCES product_media(id, product_id) ON DELETE CASCADE
);

CREATE INDEX idx_product_variant_media_media
  ON product_variant_media(media_id, variant_id);

CREATE TABLE attribute_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection TEXT NOT NULL CHECK (length(trim(collection)) BETWEEN 1 AND 80),
  category TEXT NOT NULL DEFAULT '' CHECK (length(category) <= 120),
  code TEXT NOT NULL COLLATE NOCASE
    CHECK (length(trim(code)) BETWEEN 1 AND 80),
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  value_type TEXT NOT NULL
    CHECK (value_type IN ('text', 'number', 'boolean', 'reference', 'list')),
  unit TEXT CHECK (
    unit IS NULL
    OR (value_type = 'number' AND length(trim(unit)) BETWEEN 1 AND 24)
  ),
  constraints_json TEXT NOT NULL DEFAULT '{}'
    CHECK (
      json_valid(constraints_json)
      AND json_type(constraints_json) = 'object'
      AND length(constraints_json) <= 4096
    ),
  position INTEGER NOT NULL DEFAULT 0
    CHECK (typeof(position) = 'integer' AND position >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (collection, category, code),
  UNIQUE (collection, category, position),
  UNIQUE (id, collection)
);

CREATE INDEX idx_attribute_definitions_scope
  ON attribute_definitions(collection, category, active, position, id);

CREATE TABLE product_attribute_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id INTEGER,
  attribute_definition_id INTEGER NOT NULL
    REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
  value_text TEXT CHECK (
    value_text IS NULL OR length(value_text) BETWEEN 1 AND 5000
  ),
  value_number REAL CHECK (
    value_number IS NULL OR typeof(value_number) IN ('integer', 'real')
  ),
  value_boolean INTEGER CHECK (
    value_boolean IS NULL OR value_boolean IN (0, 1)
  ),
  value_reference TEXT CHECK (
    value_reference IS NULL OR length(trim(value_reference)) BETWEEN 1 AND 500
  ),
  value_list_json TEXT CHECK (
    value_list_json IS NULL
    OR (
      json_valid(value_list_json)
      AND json_type(value_list_json) = 'array'
      AND json_array_length(value_list_json) > 0
      AND length(value_list_json) <= 4096
    )
  ),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (variant_id, product_id)
    REFERENCES product_variants(id, product_id) ON DELETE CASCADE,
  CHECK (
    (value_text IS NOT NULL)
    + (value_number IS NOT NULL)
    + (value_boolean IS NOT NULL)
    + (value_reference IS NOT NULL)
    + (value_list_json IS NOT NULL) = 1
  )
);

CREATE UNIQUE INDEX idx_product_attribute_values_product
  ON product_attribute_values(product_id, attribute_definition_id)
  WHERE variant_id IS NULL;

CREATE UNIQUE INDEX idx_product_attribute_values_variant
  ON product_attribute_values(variant_id, attribute_definition_id)
  WHERE variant_id IS NOT NULL;

CREATE INDEX idx_product_attribute_values_definition
  ON product_attribute_values(attribute_definition_id, product_id, variant_id);

INSERT INTO product_media (
  product_id, kind, source, alt_text, focal_x_bps, focal_y_bps, position,
  created_at, updated_at
)
SELECT
  id, 'image', image, name, 5000, 5000, 0, created_at, created_at
FROM products
WHERE length(trim(image)) > 0
ORDER BY id;
```

## Invariantes de dominio y escritura

- El foco se almacena en puntos base enteros (`0..10000`) y la presentación lo
  convierte a porcentaje. No se introduce una igualdad frágil de `REAL`.
- `source` es una ruta local, URL o clave de objeto; nunca un blob ni un secreto.
- Una asociación variante–media solo puede unir filas del mismo producto. Las
  dos FKs compuestas lo garantizan también fuera de la aplicación.
- La posición es densa (`0..n-1`) dentro de cada galería. Altas, movimientos y
  bajas reescriben el orden completo en una única batch optimista.
- La primera media de tipo `image` se refleja en `products.image` en esa misma
  batch. Si no queda ninguna imagen, el espejo pasa a `''`. Un binario anterior
  conserva así una vista coherente durante todo R2.
- Si no existen filas canónicas, el lector devuelve un fallback sintético desde
  `products.image`, con foco centrado y el nombre del producto como alt.
- Una definición aplica a su `collection` y a su categoría exacta, o a todas
  las categorías de la colección cuando `category = ''`.
- `number` admite una unidad declarativa; «unidad» no es un sexto almacenamiento
  porque el valor continúa siendo numérico y validable.
- `constraints_json` tiene un contrato cerrado por tipo: longitudes para texto,
  mínimo/máximo/paso para número, prefijos admitidos para referencia y opciones
  más cardinalidad para lista. Booleano no admite restricciones adicionales.
- La aplicación valida que la columna no nula coincide con `value_type`, que el
  valor satisface sus restricciones y que producto/variante entran en el ámbito
  de la definición. SQL garantiza además que solo haya una columna no nula.
- Un valor de variante sustituye al valor de producto para la misma definición;
  no crea una segunda definición visible.
- Desactivar una definición impide valores nuevos, pero conserva lectura y
  edición de los existentes. Una definición con valores no se borra.
- Todas las mutaciones administrativas validan payload en servidor, exigen el
  timestamp esperado y escriben `audit_log` en la misma batch. Una carrera deja
  un ganador, no posiciones duplicadas ni evidencia huérfana.

## Capacidades y superficies

- `CAT-008` posee media y pertenece al módulo `catalog`.
- `CAT-007` posee definiciones y valores; depende de `CAT-001` y se activa solo
  en composiciones que lo declaren.
- El preset `advanced` y la demo pública activan ambas capacidades. `minimal` y
  `standard` no reciben rutas, controles ni payloads administrativos nuevos.
- Los endpoints de media se protegen con `CAT-008`; los de definiciones/valores
  con `CAT-007`. Que la ficha avanzada ya requiera `CAT-003` no sustituye esas
  comprobaciones en cada API.
- Storefront y quote no aceptan media ni atributos enviados por cliente; solo
  leen la proyección validada del catálogo.

## Seed, backup, fallback y recuperación

- El seed v1 transforma `image` en una fila media; `specs_json` permanece como
  fallback y no se interpreta durante la migración porque sus etiquetas no son
  códigos ni tipos fiables.
- El seed v2 acepta `media`, `attributeDefinitions` y `attributes`; valida todo
  antes de emitir SQL y mantiene el espejo `products.image`.
- El backup de esquema 3 exporta definiciones, media, asociaciones y valores en
  orden de FK. El restore rechaza versiones incompatibles y verifica recuentos,
  posiciones, ámbitos, tipos y `foreign_key_check`.
- El rollback de binario es inmediato mientras `products.image` siga reflejado.
  `specs_json` no se sobreescribe: un binario anterior conserva la ficha técnica
  legacy aunque todavía no vea atributos creados solo en el contrato nuevo.

## Rehearsal y puerta de corte

Antes de aplicar `0008` a cualquier D1 compartida:

1. exportar una copia fresca y restaurarla en una base aislada;
2. ejecutar preflight de imágenes vacías, posiciones y claves foráneas;
3. aplicar el SQL anterior dos veces desde dos restauraciones idénticas;
4. comprobar un media por cada `products.image` no vacío, foco centrado, mismo
   source, cero asociaciones/atributos iniciales y cero violaciones FK;
5. generar backup de esquema 3, restaurarlo en otra base aislada y comparar
   hash lógico por tabla;
6. demostrar que el lector legacy produce las mismas imágenes antes y después;
7. conservar la copia hasta completar smoke y periodo de observación.

## Alternativas rechazadas

- **JSON de galería o atributos dentro de `products`:** impide FKs, orden
  concurrente, asociación a variante y validación indexable.
- **Una tabla de assets reutilizables ahora:** adelanta CAT-009 y mezcla
  almacenamiento con el uso editorial que R2.5 sí necesita.
- **Foco como `REAL 0..1`:** añade redondeos evitables al contrato y a backups.
- **Copiar media por variante:** duplica alt/foco/source y permite divergencias.
- **Convertir `specs_json` automáticamente:** sus etiquetas libres no permiten
  inferir códigos, tipos, unidades ni restricciones sin inventar datos.
- **Atributos globales sin colección:** dos clones/colecciones no podrían usar
  el mismo código con etiquetas o unidades distintas.
- **Referencia FK a producto:** CAT-006 aún no define la taxonomía referenciable;
  R2.5 conserva un identificador opaco validable y portable.

## Consecuencias

- La ficha y el panel pueden demostrar galería real y datos técnicos validados
  sin tocar dinero, stock, pago ni fulfillment.
- D1 sigue guardando solo metadatos pequeños y cabe en el modelo de coste actual.
- Hay doble escritura temporal únicamente para la primera imagen, acotada hasta
  la contracción de R2.14.
- La validez cruzada entre definición y valor vive en el servicio de catálogo y
  en seed/restore; SQLite conserva las guardas estructurales que sí puede probar.
- La puerta de `0008` fue aprobada expresamente por Andreu el 2026-08-10.

## Resultado de la puerta

El rehearsal sobre un export remoto fresco conservó hashes legacy/canónicos,
materializó 207 medias y pasó dump/restore con cero violaciones FK. Tras la
verificación local (49 suites, 332 tests, E2E 37/37 y a11y 2/2), `0008` se
aplicó en D1 y se desplegó el Worker compatible
`94d51142-49c3-444a-921c-3790227117e0`. El seed productivo deja 208 medias,
cinco definiciones y seis valores sin divergencias de `products.image`.
