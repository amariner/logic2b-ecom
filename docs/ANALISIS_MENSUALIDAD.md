# Análisis de la mensualidad — la cuota única de Logic2B Ecommerce (D7)

> **2026-07-28.** Encargo de Andreu: el concepto de la mensualidad ya está
> decidido — **una sola cuota personalizada que cubre mantenimiento,
> asistencia y seguimiento**, contra el patrón del mercado de apilar
> suscripción + mantenimiento + SEO + contenido, cada uno por su lado. Lo que
> falta son las **cifras**. Este documento las prepara: benchmark del mercado
> español 2026 con fuentes, la cuenta del «stacking» que sufre una tienda
> típica, y una propuesta de escalera para que Andreu diga sí o ajuste.
> **Ninguna cifra de aquí se publica sin su OK** (veto de product).

---

## 1. Lo que cobra el mercado (España, 2026)

Rangos contrastados en varias fuentes cada uno:

| Servicio (por separado) | Rango de mercado | Lo habitual para una pyme |
|---|---|---|
| Mantenimiento web genérico | 30–200 €/mes | 50–150 €/mes |
| Mantenimiento de tienda online (Woo/Presta) | 79–300 €/mes | 90–150 €/mes; «premium» 150–300 |
| SEO continuo (agencia pequeña) | 400–1.500 €/mes | 600–1.000 €/mes; freelance desde 150–400 |
| Redacción de contenidos SEO | 80–300 €/artículo | marketing de contenidos 500–4.000 €/mes |
| Marketing digital integral | 400–3.000 €/mes | básico 450–800 · crecimiento 800–1.600 |
| Shopify (la «suscripción») | Basic 24–36 €/mes · Grow 69–92 €/mes | + apps 40–180 €/mes + tema 280–450 € único + comisiones 2,1 % + 0,30 € (Payments) o 0,5–2 % extra con pasarela externa |

Fuentes principales: Cronoshare y WebsBarcelona (mantenimiento), Nerade,
Rubén Tous y Mantpress (WordPress/Woo), FCSEO, Marketboom y TopSEOwebs (SEO
pyme), BluCactus y Shoptexto (contenidos), Esconzeta, TeVeoOnline y
Digital Nature (marketing integral), Finom, Atlas y Alicante Developers
(Shopify). URLs completas al final.

## 2. La cuenta del «stacking» — lo que de verdad paga una tienda pequeña

Tienda tipo: ~3.000 €/mes de ventas, ~120 pedidos.

**Solo por existir (Shopify), sin nadie detrás:**

| Concepto | €/mes |
|---|---|
| Suscripción Basic (pago mensual) | 36 |
| Apps (reseñas, SEO, envíos, idioma…) | 40–80 |
| Comisiones de pago (2,1 % + 0,30 €) | ~99 |
| **Total plataforma** | **~175–215 €/mes** + 21 % IVA |

Y con eso no tiene mantenimiento humano, ni SEO, ni contenido, ni nadie a
quien llamar: el soporte es el chat genérico de la plataforma.

**Si además quiere crecer (lo que el mercado le obliga a apilar):**

| Proveedor 2 | mantenimiento/incidencias | 90–150 |
| Proveedor 3 | SEO continuo | 400–600 |
| Proveedor 4 | contenidos | 150–400 |

**Total real: 800–1.350 €/mes repartidos entre 3–4 proveedores que no se
hablan entre sí.** Esta cuenta es el argumento P3 hecho números y debe
aparecer (redondeada y honesta) en la landing y el dossier.

## 3. Nuestra estructura de costes (por qué podemos romper esto)

- **Infraestructura 0 €** (Cloudflare free tier, demostrado en producción).
- **Motor propio compartido**: sin plugins de terceros que actualizar, sin
  parches de seguridad ajenos, sin «se ha roto la web con el update». El
  mantenimiento técnico real por tienda es bajísimo y está automatizado
  (auditor a11y, Lighthouse, E2E).
- **El seguimiento es barato para nosotros y oro para el cliente**: el panel
  ya tiene los datos (pedidos, productos, estados); un informe breve lo
  redactamos nosotros desde el panel — es servicio, **no** feature nueva del
  motor.
- Somos agencia de desarrollo **y** SEO: la parte de marketing no se
  subcontrata.

La cuota no compite contra el coste de una plataforma: compite contra la SUMA
de la plataforma más los tres proveedores. Podemos estar muy por debajo de esa
suma cobrando dignamente las horas.

## 4. Propuesta de escalera — una cuota, tres tamaños

**Regla de la escalera: la cuota se SUSTITUYE, nunca se apila.** Si pasas de
Base a Crece, tu cuota ES 279 € (no 39 + 279). Cambiar de tramo es una
conversación, no un contrato nuevo.

| Plan | Cifra propuesta | Qué cubre | Ancla de mercado (por separado) | Horas/mes que compra* |
|---|---|---|---|---|
| **Base** — incluida con el Kit | **39 €/mes** (ya aprobada en D4; A medida: 59) | Mantenimiento personalizado, asistencia directa (WhatsApp/email, persona con nombre), seguimiento trimestral, actualizaciones y backups | Solo el mantenimiento vale 79–150 | ~0,5–1 h |
| **Crece** | **279 €/mes** (rango razonable 249–299) | Todo lo de Base + SEO continuo de fondo (técnico + local + fichas) + 1–2 contenidos/mes + informe mensual con plan | Mantenimiento (100) + SEO entrada (450) + contenido (150) ≈ **700 €** | ~4 h |
| **Acelera** | **590 €/mes** (rango razonable 490–650) | Todo lo de Crece + campañas (SEM/social, gestión; inversión publicitaria aparte) + CRO + email marketing | Plan «crecimiento» de agencia (800–1.600) + mantenimiento aparte ≈ **900–1.750 €** | ~8–9 h |

\* A ~65 €/h efectivos. Es la comprobación de sostenibilidad: si la cifra no
paga las horas, la promesa es mentira — y eso lo veta product.

**Notas honestas sobre la propuesta:**

1. **Base a 39 € es un rompe-mercado deliberado** y solo es sostenible porque
   el motor no da trabajo (sin plugins, infra 0, tooling automatizado). Si la
   asistencia de un cliente se dispara de forma sostenida, la respuesta no es
   sufrir: es la conversación de subir de tramo. El copy debe encuadrar la
   asistencia de Base como «razonable» sin letra pequeña rastrera.
2. **Crece a 279 € es agresivo** frente a los 600–1.000 € del SEO de agencia.
   Se sostiene si el alcance está bien acotado (SEO de fondo + 1–2 piezas, no
   una campaña); la versión «campañas de verdad» es Acelera. Si Andreu lo ve
   justo, 299 € sigue siendo menos de la mitad del stacking equivalente.
3. **La inversión publicitaria nunca va dentro de la cuota** (estándar del
   sector y única forma honesta de presentarlo).
4. IVA: los rangos de mercado citados suelen ser sin IVA; nuestras cifras
   publicadas deben decir claramente si son + IVA (hoy la landing dice «+ IVA»
   en precios — mantener el criterio).

## 5. Cómo se cuenta (material para F12.2/F12.3)

- Frase madre P3 refinada: **«Una cuota. Un equipo. Sin suscripción por un
  lado, mantenimiento por otro, SEO por otro y contenidos por otro.»**
- La tabla del §2 (redondeada) es la sección «a dónde va tu dinero» de la
  landing: plataforma que te apaña (~200 €/mes y estás solo) vs equipo que te
  acompaña (39 € y subes cuando el negocio lo pida).
- La escalera de cuota ES el pilar P2 aplicado al servicio: empiezas en Base
  (MVP), subes a Crece cuando quieres tráfico, a Acelera cuando quieres
  escala. El mismo relato que las features: se añade cuando la tienda lo pide.

## 6. Lo que queda en la mesa de Andreu

- [ ] Confirmar o ajustar **las tres cifras** (39 ya está aprobada en D4).
- [ ] Nombre de los tramos («Base / Crece / Acelera» es propuesta).
- [ ] Qué informe lleva Base (trimestral propuesto) y Crece (mensual).
- [ ] Tarifas de partner para agencias (D8c) — otro documento cuando toque
  F12.4; la lógica de marca blanca ya está decidida.

## Fuentes

- Mantenimiento: https://www.cronoshare.com/cuanto-cuesta/mantener-pagina-web ·
  https://websbarcelona.com/blog/cuanto-cuesta-mantenimiento-web ·
  https://osyrismarketingdigital.com/blog/mantenimiento-web-precio-que-incluye
- WordPress/Woo: https://nerade.com/blog/mantenimiento-web-wordpress-precio/ ·
  https://www.rubentous.com/servicios/mantenimiento-wordpress/planes-y-precios-mantenimiento-wordpress-y-woocommerce/ ·
  https://mantpress.com/blog/cuanto-cuesta-mantenimiento-wordpress/
- SEO: https://fcseo.es/blog/cuanto-cuesta-el-seo-para-una-pyme-precios-reales-planes-y-que-incluye-cada-uno/ ·
  https://marketboom.es/cuanto-cuesta-el-seo-en-espana/ ·
  https://www.topseowebs.com/precios-seo-tarifas/
- Contenidos: https://blucactus.es/cuanto-cuesta-el-marketing-de-contenido/ ·
  https://shoptexto.com/tarifas-y-precios-de-redaccion-de-contenidos-en-espanol/
- Marketing integral: https://www.esconzeta.com/es/blog/cuanto-cuesta-agencia-marketing-digital-espana ·
  https://teveoonline.com/blog/agencia-de-marketing-digital-precios/ ·
  https://www.digital-nature.com/cuanto-cuesta-agencia-marketing-digital/
- Shopify: https://finom.co/es-es/blog/shopify-precios/ ·
  https://theatlas.es/blog/cuanto-cuesta-tienda-shopify-2026/ ·
  https://alicantedevelopers.com/comisiones-shopify/
