/** Casos de uso admin con mutación y evidencia atómicas (R1.8). */

import {
  CatalogAdminError,
  attributeValueStorage,
  createProductAdmin,
  normalizeAttributeDefinition,
  validateMediaWrite,
  validateOptionName,
  validateOptionValue,
  validateVariantWrite,
  type ProductOptionCreate,
  type ProductOptionPatch,
  type ProductOptionValueCreate,
  type ProductOptionValuePatch,
  type ProductPatch,
  type AttributeDefinitionWrite,
  type AttributeTypedValue,
  type ProductMediaWrite,
  type ProductVariantAdminDetails,
  type ProductVariantAdminRow,
  type ProductVariantCreate,
  type ProductVariantWrite,
} from '../modules/catalog';
import { createFulfillmentAdmin, type ShippingRatePatch } from '../modules/fulfillment';
import {
  createD1AuditLogWriter,
  createD1CatalogContentAuditWriter,
  createD1CatalogVariantAuditWriter,
  type CatalogOptionGuard,
  type CatalogOptionValueGuard,
  type CatalogProductGuard,
  type CatalogVariantGuard,
  type CatalogVariantValues,
} from '../platform/operations';
import { createAuditDiff, createAuditEntry } from '../shared-kernel/audit';
import type { ReserveEventIdentity } from '../shared-kernel/events';
import { reservePlatformEventIdentity } from './event-context';

export type AdminMutationOutcome = 'applied' | 'unchanged' | 'not-found' | 'conflict' | 'invalid';

const ADMIN_ACTOR = Object.freeze({ kind: 'admin', id: 'admin-panel', label: 'Panel de administración' } as const);

export function createAdminOperations(
  db: D1Database,
  reserveIdentity: ReserveEventIdentity = reservePlatformEventIdentity,
) {
  const products = createProductAdmin(db);
  const fulfillment = createFulfillmentAdmin(db);
  const audit = createD1AuditLogWriter(db);
  const variantAudit = createD1CatalogVariantAuditWriter(db);
  const contentAudit = createD1CatalogContentAuditWriter(db);

  function entry(
    action: string,
    entity: Readonly<{ type: string; id: string; reference?: string }>,
    diff: ReturnType<typeof createAuditDiff>,
  ) {
    return createAuditEntry(reserveIdentity(), { actor: ADMIN_ACTOR, action, entity, diff });
  }

  function productGuard(details: ProductVariantAdminDetails): CatalogProductGuard | null {
    const { product } = details;
    if (product.default_variant_id === null) return null;
    return {
      id: product.id,
      slug: product.slug,
      price_cents: product.price_cents,
      compare_at_price_cents: product.compare_at_price_cents,
      active: product.active,
      default_variant_id: product.default_variant_id,
      option_count: details.options.length,
      option_value_count: details.options.reduce((sum, option) => sum + option.values.length, 0),
      variant_count: details.variants.length,
    };
  }

  function optionGuard(option: Awaited<ReturnType<typeof products.findOption>> & {}): CatalogOptionGuard {
    return {
      id: option.id,
      product_id: option.product_id,
      name: option.name,
      position: option.position,
      value_count: option.value_count,
      variant_count: option.variant_count,
    };
  }

  function optionValueGuard(
    value: Awaited<ReturnType<typeof products.findOptionValue>> & {},
  ): CatalogOptionValueGuard {
    return {
      id: value.id,
      option_id: value.option_id,
      product_id: value.product_id,
      value: value.value,
      position: value.position,
      variant_count: value.variant_count,
    };
  }

  function variantGuard(variant: ProductVariantAdminRow): CatalogVariantGuard {
    return {
      id: variant.id,
      product_id: variant.product_id,
      sku: variant.sku,
      gtin: variant.gtin,
      mpn: variant.mpn,
      title: variant.title,
      price_cents: variant.price_cents,
      compare_at_price_cents: variant.compare_at_price_cents,
      status: variant.status,
      is_default: variant.is_default,
      option_signature: variant.option_signature,
      option_value_ids: variant.option_value_ids,
      order_item_count: variant.order_item_count,
    };
  }

  function variantValues(write: ProductVariantWrite, signatureIds: readonly number[]): CatalogVariantValues {
    return {
      sku: write.sku,
      gtin: write.gtin,
      mpn: write.mpn,
      title: write.title,
      price_cents: write.price_cents,
      compare_at_price_cents: write.compare_at_price_cents,
      status: write.status,
      option_value_ids: signatureIds,
      option_signature: JSON.stringify(signatureIds),
    };
  }

  return Object.freeze({
    async updateProduct(id: number, patch: ProductPatch): Promise<AdminMutationOutcome> {
      const before = await products.find(id);
      if (before === null) return 'not-found';
      const touchesVariant = [
        patch.price_cents,
        patch.compare_at_price_cents,
        patch.active,
        patch.sku,
        patch.gtin,
        patch.mpn,
        patch.variant_title,
        patch.variant_status,
      ].some((value) => value !== undefined);
      if (touchesVariant && before.default_variant_id === null) return 'conflict';
      if (
        touchesVariant &&
        (
          before.default_variant_price_cents !== before.price_cents ||
          before.default_variant_compare_at_price_cents !== before.compare_at_price_cents ||
          (before.default_variant_status === 'active') !== (before.active === 1)
        )
      ) return 'conflict';
      const effectivePrice = patch.price_cents ?? before.price_cents;
      const effectiveCompareAt = patch.compare_at_price_cents === undefined
        ? before.compare_at_price_cents
        : patch.compare_at_price_cents;
      if (effectiveCompareAt !== null && effectiveCompareAt <= effectivePrice) return 'invalid';
      const after = {
        ...before,
        ...(patch.name === undefined ? {} : { name: patch.name }),
        ...(patch.price_cents === undefined ? {} : { price_cents: patch.price_cents }),
        ...(patch.compare_at_price_cents === undefined ? {} : {
          compare_at_price_cents: patch.compare_at_price_cents,
        }),
        ...(patch.price_cents === undefined ? {} : { default_variant_price_cents: patch.price_cents }),
        ...(patch.compare_at_price_cents === undefined ? {} : {
          default_variant_compare_at_price_cents: patch.compare_at_price_cents,
        }),
        ...(patch.stock === undefined ? {} : { stock: patch.stock }),
        ...(patch.active === undefined ? {} : { active: patch.active ? 1 : 0 }),
        ...(patch.active === undefined || patch.variant_status !== undefined ? {} : {
          default_variant_status: patch.active ? 'active' : 'archived',
        }),
        ...(patch.sku === undefined ? {} : { default_sku: patch.sku }),
        ...(patch.gtin === undefined ? {} : { default_gtin: patch.gtin }),
        ...(patch.mpn === undefined ? {} : { default_mpn: patch.mpn }),
        ...(patch.variant_title === undefined ? {} : { default_variant_title: patch.variant_title }),
        ...(patch.variant_status === undefined ? {} : {
          default_variant_status: patch.variant_status,
          active: patch.active === undefined ? (patch.variant_status === 'active' ? 1 : 0) : (patch.active ? 1 : 0),
        }),
      };
      const diff = createAuditDiff(before, after, [
        'name', 'price_cents', 'compare_at_price_cents', 'stock', 'active', 'default_sku', 'default_gtin',
        'default_mpn', 'default_variant_title', 'default_variant_status',
        'default_variant_price_cents', 'default_variant_compare_at_price_cents',
      ]);
      if (Object.keys(diff).length === 0) return 'unchanged';
      const entry = createAuditEntry(reserveIdentity(), {
        actor: ADMIN_ACTOR,
        action: 'catalog.product_updated',
        entity: { type: 'product', id: String(before.id), reference: before.slug },
        diff,
      });
      return audit.updateProduct(entry, before, patch);
    },

    async createProductOption(input: ProductOptionCreate): Promise<AdminMutationOutcome> {
      const details = await products.details(input.product_id);
      if (!details) return 'not-found';
      const guard = productGuard(details);
      if (!guard) return 'conflict';
      validateOptionName(details.options, input.name);
      const position = details.options.reduce((max, option) => Math.max(max, option.position), -1) + 1;
      const auditEntry = entry(
        'catalog.option_created',
        { type: 'product_option', id: `new:${input.product_id}:${position}`, reference: input.name },
        createAuditDiff(
          { name: null, position: null },
          { name: input.name, position },
          ['name', 'position'],
        ),
      );
      return variantAudit.createOption(auditEntry, guard, { name: input.name, position });
    },

    async updateProductOption(id: number, patch: ProductOptionPatch): Promise<AdminMutationOutcome> {
      const before = await products.findOption(id);
      if (!before) return 'not-found';
      const details = await products.details(before.product_id);
      if (!details) return 'not-found';
      validateOptionName(details.options, patch.name, id);
      if (before.name === patch.name) return 'unchanged';
      const auditEntry = entry(
        'catalog.option_updated',
        { type: 'product_option', id: String(id), reference: before.product_slug },
        createAuditDiff(before, { ...before, name: patch.name }, ['name']),
      );
      return variantAudit.updateOption(auditEntry, optionGuard(before), patch.name);
    },

    async deleteProductOption(id: number): Promise<AdminMutationOutcome> {
      const before = await products.findOption(id);
      if (!before) return 'not-found';
      if (before.variant_count > 0) {
        throw new CatalogAdminError(
          'in-use',
          'La opción está usada por variantes; cambia o elimina esas combinaciones primero.',
        );
      }
      const auditEntry = entry(
        'catalog.option_deleted',
        { type: 'product_option', id: String(id), reference: before.product_slug },
        createAuditDiff(before, { ...before, name: null, position: null }, ['name', 'position']),
      );
      return variantAudit.deleteOption(auditEntry, optionGuard(before));
    },

    async createProductOptionValue(input: ProductOptionValueCreate): Promise<AdminMutationOutcome> {
      const option = await products.findOption(input.option_id);
      if (!option) return 'not-found';
      const details = await products.details(option.product_id);
      const adminOption = details?.options.find((candidate) => candidate.id === option.id);
      if (!details || !adminOption) return 'conflict';
      validateOptionValue(adminOption, input.value);
      const position = adminOption.values.reduce((max, value) => Math.max(max, value.position), -1) + 1;
      const auditEntry = entry(
        'catalog.option_value_created',
        { type: 'product_option_value', id: `new:${option.id}:${position}`, reference: option.product_slug },
        createAuditDiff(
          { value: null, position: null },
          { value: input.value, position },
          ['value', 'position'],
        ),
      );
      return variantAudit.createOptionValue(auditEntry, optionGuard(option), { value: input.value, position });
    },

    async updateProductOptionValue(
      id: number,
      patch: ProductOptionValuePatch,
    ): Promise<AdminMutationOutcome> {
      const before = await products.findOptionValue(id);
      if (!before) return 'not-found';
      const details = await products.details(before.product_id);
      const option = details?.options.find((candidate) => candidate.id === before.option_id);
      if (!details || !option) return 'conflict';
      validateOptionValue(option, patch.value, id);
      if (before.value === patch.value) return 'unchanged';
      const auditEntry = entry(
        'catalog.option_value_updated',
        { type: 'product_option_value', id: String(id), reference: before.product_slug },
        createAuditDiff(before, { ...before, value: patch.value }, ['value']),
      );
      return variantAudit.updateOptionValue(auditEntry, optionValueGuard(before), patch.value);
    },

    async deleteProductOptionValue(id: number): Promise<AdminMutationOutcome> {
      const before = await products.findOptionValue(id);
      if (!before) return 'not-found';
      if (before.variant_count > 0) {
        throw new CatalogAdminError(
          'in-use',
          'El valor está usado por variantes; cambia o elimina esas combinaciones primero.',
        );
      }
      const auditEntry = entry(
        'catalog.option_value_deleted',
        { type: 'product_option_value', id: String(id), reference: before.product_slug },
        createAuditDiff(before, { ...before, value: null, position: null }, ['value', 'position']),
      );
      return variantAudit.deleteOptionValue(auditEntry, optionValueGuard(before));
    },

    async createProductVariant(input: ProductVariantCreate): Promise<AdminMutationOutcome> {
      const details = await products.details(input.product_id);
      if (!details) return 'not-found';
      const guard = productGuard(details);
      if (!guard) return 'conflict';
      const signatureIds = validateVariantWrite(details, input);
      const values = variantValues(input, signatureIds);
      const auditEntry = entry(
        'catalog.variant_created',
        {
          type: 'product_variant',
          id: `new:${input.product_id}:${guard.variant_count}`,
          reference: input.sku,
        },
        createAuditDiff(
          { sku: null, title: null, price_cents: null, status: null, option_signature: null },
          values,
          ['sku', 'title', 'price_cents', 'status', 'option_signature'],
        ),
      );
      return variantAudit.createVariant(auditEntry, guard, values);
    },

    async updateProductVariant(id: number, write: ProductVariantWrite): Promise<AdminMutationOutcome> {
      const before = await products.findVariant(id);
      if (!before) return 'not-found';
      const details = await products.details(before.product_id);
      if (!details) return 'not-found';
      const product = productGuard(details);
      if (!product) return 'conflict';
      const signatureIds = validateVariantWrite(details, write, before);
      const values = variantValues(write, signatureIds);
      const makeDefault = write.make_default === true && !before.is_default;
      const mirrorsLegacy = before.is_default || makeDefault;
      const auditBefore = {
        ...before,
        product_price_cents: details.product.price_cents,
        product_compare_at_price_cents: details.product.compare_at_price_cents,
        product_active: details.product.active,
      };
      const after = {
        ...before,
        ...values,
        is_default: before.is_default || makeDefault,
        product_price_cents: mirrorsLegacy ? values.price_cents : details.product.price_cents,
        product_compare_at_price_cents: mirrorsLegacy
          ? values.compare_at_price_cents
          : details.product.compare_at_price_cents,
        product_active: mirrorsLegacy ? (values.status === 'active' ? 1 : 0) : details.product.active,
      };
      const diff = createAuditDiff(auditBefore, after, [
        'sku', 'gtin', 'mpn', 'title', 'price_cents', 'compare_at_price_cents',
        'status', 'is_default', 'option_signature', 'product_price_cents',
        'product_compare_at_price_cents', 'product_active',
      ]);
      if (Object.keys(diff).length === 0) return 'unchanged';
      const auditEntry = entry(
        'catalog.variant_updated',
        { type: 'product_variant', id: String(id), reference: details.product.slug },
        diff,
      );
      return variantAudit.updateVariant(
        auditEntry,
        product,
        variantGuard(before),
        values,
        makeDefault,
      );
    },

    async deleteProductVariant(id: number): Promise<AdminMutationOutcome> {
      const before = await products.findVariant(id);
      if (!before) return 'not-found';
      if (before.is_default) {
        throw new CatalogAdminError('default-protected', 'La variante por defecto no se puede eliminar.');
      }
      if (before.order_item_count > 0) {
        throw new CatalogAdminError(
          'in-use',
          'La variante aparece en pedidos; archívala para conservar el histórico.',
        );
      }
      const auditEntry = entry(
        'catalog.variant_deleted',
        { type: 'product_variant', id: String(id), reference: before.sku },
        createAuditDiff(
          before,
          { ...before, sku: null, status: null, option_signature: null },
          ['sku', 'status', 'option_signature'],
        ),
      );
      return variantAudit.deleteVariant(auditEntry, variantGuard(before));
    },

    async createProductMedia(productId: number, write: ProductMediaWrite): Promise<AdminMutationOutcome> {
      const details = await products.details(productId);
      if (!details) return 'not-found';
      const values = validateMediaWrite(write);
      const variantIds = new Set(details.variants.map((variant) => variant.id));
      if (values.variant_ids.some((id) => !variantIds.has(id))) {
        throw new CatalogAdminError('invalid-selection', 'La media contiene variantes ajenas al producto.');
      }
      const position = details.media.length;
      const auditEntry = entry(
        'catalog.media_created',
        { type: 'product_media', id: `new:${productId}:${position}`, reference: details.product.slug },
        createAuditDiff(
          { source: null, kind: null, position: null },
          { source: values.source, kind: values.kind, position },
          ['source', 'kind', 'position'],
        ),
      );
      return contentAudit.createMedia(auditEntry, {
        id: details.product.id,
        slug: details.product.slug,
        image: details.product.image,
        media_count: details.media.length,
      }, values);
    },

    async updateProductMedia(id: number, write: ProductMediaWrite): Promise<AdminMutationOutcome> {
      const before = await products.findMedia(id);
      if (!before) return 'not-found';
      const details = await products.details(before.product_id);
      if (!details) return 'not-found';
      const values = validateMediaWrite(write);
      const variantIds = new Set(details.variants.map((variant) => variant.id));
      if (values.variant_ids.some((variantId) => !variantIds.has(variantId))) {
        throw new CatalogAdminError('invalid-selection', 'La media contiene variantes ajenas al producto.');
      }
      const after = { ...before, ...values };
      const diff = createAuditDiff(before, after, [
        'kind', 'source', 'alt_text', 'focal_x_bps', 'focal_y_bps', 'variant_ids',
      ]);
      if (Object.keys(diff).length === 0) return 'unchanged';
      const auditEntry = entry(
        'catalog.media_updated',
        { type: 'product_media', id: String(id), reference: details.product.slug },
        diff,
      );
      return contentAudit.updateMedia(auditEntry, before, values);
    },

    async reorderProductMedia(productId: number, orderedIds: readonly number[]): Promise<AdminMutationOutcome> {
      const details = await products.details(productId);
      if (!details) return 'not-found';
      const currentIds = details.media.map((media) => media.id);
      if (
        orderedIds.length !== currentIds.length
        || new Set(orderedIds).size !== orderedIds.length
        || orderedIds.some((id) => !currentIds.includes(id))
      ) {
        throw new CatalogAdminError('invalid-selection', 'El orden debe contener toda la galería una sola vez.');
      }
      if (orderedIds.every((id, position) => id === currentIds[position])) return 'unchanged';
      const auditEntry = entry(
        'catalog.media_reordered',
        { type: 'product_media_gallery', id: String(productId), reference: details.product.slug },
        createAuditDiff(
          { ordered_ids: currentIds },
          { ordered_ids: [...orderedIds] },
          ['ordered_ids'],
        ),
      );
      return contentAudit.reorderMedia(
        auditEntry,
        { id: productId, slug: details.product.slug },
        details.media,
        orderedIds,
      );
    },

    async deleteProductMedia(id: number): Promise<AdminMutationOutcome> {
      const before = await products.findMedia(id);
      if (!before) return 'not-found';
      const details = await products.details(before.product_id);
      if (!details) return 'not-found';
      if (details.media.length <= 1) {
        throw new CatalogAdminError('in-use', 'El producto debe conservar al menos una media.');
      }
      const later = details.media.filter((media) => media.position > before.position);
      const auditEntry = entry(
        'catalog.media_deleted',
        { type: 'product_media', id: String(id), reference: details.product.slug },
        createAuditDiff(before, { ...before, source: null, position: null }, ['source', 'position']),
      );
      return contentAudit.deleteMedia(
        auditEntry,
        before,
        later.length,
        later.reduce((sum, media) => sum + media.variant_ids.length, 0),
      );
    },

    async createAttributeDefinition(
      productId: number,
      write: AttributeDefinitionWrite,
    ): Promise<AdminMutationOutcome> {
      const details = await products.details(productId);
      if (!details) return 'not-found';
      const values = normalizeAttributeDefinition(write);
      const scoped = details.attribute_definitions.filter((definition) =>
        definition.collection === details.product.collection && definition.category === details.product.category
      );
      if (scoped.some((definition) => definition.code.toLocaleLowerCase('en') === values.code)) {
        throw new CatalogAdminError('invalid-selection', 'Ya existe un atributo con ese código en la categoría.');
      }
      const auditEntry = entry(
        'catalog.attribute_definition_created',
        { type: 'attribute_definition', id: `new:${productId}:${values.code}`, reference: details.product.slug },
        createAuditDiff(
          { code: null, value_type: null },
          { code: values.code, value_type: values.value_type },
          ['code', 'value_type'],
        ),
      );
      return contentAudit.createDefinition(auditEntry, {
        product_id: productId,
        collection: details.product.collection,
        category: details.product.category,
        count: scoped.length,
      }, values);
    },

    async updateAttributeDefinition(
      id: number,
      write: AttributeDefinitionWrite,
    ): Promise<AdminMutationOutcome> {
      const before = await products.findAttributeDefinition(id);
      if (!before) return 'not-found';
      const values = normalizeAttributeDefinition(write);
      if (
        before.value_count > 0 &&
        (before.value_type !== values.value_type || before.unit !== values.unit || before.constraints_json !== values.constraints_json)
      ) {
        throw new CatalogAdminError(
          'in-use',
          'No se puede cambiar tipo, unidad o restricciones mientras existan valores.',
        );
      }
      const diff = createAuditDiff(before, { ...before, ...values }, [
        'code', 'label', 'value_type', 'unit', 'constraints_json', 'active',
      ]);
      if (Object.keys(diff).length === 0) return 'unchanged';
      const auditEntry = entry(
        'catalog.attribute_definition_updated',
        { type: 'attribute_definition', id: String(id), reference: `${before.collection}:${before.category}` },
        diff,
      );
      return contentAudit.updateDefinition(auditEntry, before, values);
    },

    async deleteAttributeDefinition(id: number): Promise<AdminMutationOutcome> {
      const before = await products.findAttributeDefinition(id);
      if (!before) return 'not-found';
      if (before.value_count > 0) {
        throw new CatalogAdminError('in-use', 'El atributo tiene valores; desactívalo para conservar los datos.');
      }
      const auditEntry = entry(
        'catalog.attribute_definition_deleted',
        { type: 'attribute_definition', id: String(id), reference: `${before.collection}:${before.category}` },
        createAuditDiff(before, { ...before, code: null }, ['code']),
      );
      return contentAudit.deleteDefinition(auditEntry, before);
    },

    async createProductAttributeValue(
      productId: number,
      definitionId: number,
      variantId: number | null,
      input: AttributeTypedValue,
    ): Promise<AdminMutationOutcome> {
      const [details, definition] = await Promise.all([
        products.details(productId),
        products.findAttributeDefinition(definitionId),
      ]);
      if (!details || !definition) return 'not-found';
      if (
        definition.collection !== details.product.collection ||
        (definition.category !== '' && definition.category !== details.product.category)
      ) {
        throw new CatalogAdminError('invalid-selection', 'El atributo no pertenece al producto.');
      }
      if (variantId !== null && !details.variants.some((variant) => variant.id === variantId)) {
        throw new CatalogAdminError('invalid-selection', 'La variante no pertenece al producto.');
      }
      const storage = attributeValueStorage(definition, input);
      const auditEntry = entry(
        'catalog.attribute_value_created',
        { type: 'product_attribute_value', id: `new:${productId}:${variantId ?? 'product'}:${definitionId}`, reference: details.product.slug },
        createAuditDiff(
          { definition_id: null, value: null },
          { definition_id: definitionId, value: storage },
          ['definition_id', 'value'],
        ),
      );
      return contentAudit.createAttributeValue(auditEntry, {
        product_id: productId,
        variant_id: variantId,
        definition_id: definitionId,
      }, storage);
    },

    async updateProductAttributeValue(id: number, input: AttributeTypedValue): Promise<AdminMutationOutcome> {
      const before = await products.findAttributeValue(id);
      if (!before) return 'not-found';
      const definition = await products.findAttributeDefinition(before.attribute_definition_id);
      if (!definition) return 'conflict';
      const storage = attributeValueStorage(definition, input);
      const diff = createAuditDiff(before, { ...before, ...storage }, [
        'value_text', 'value_number', 'value_boolean', 'value_reference', 'value_list_json',
      ]);
      if (Object.keys(diff).length === 0) return 'unchanged';
      const auditEntry = entry(
        'catalog.attribute_value_updated',
        { type: 'product_attribute_value', id: String(id), reference: String(before.product_id) },
        diff,
      );
      return contentAudit.updateAttributeValue(auditEntry, before, storage);
    },

    async deleteProductAttributeValue(id: number): Promise<AdminMutationOutcome> {
      const before = await products.findAttributeValue(id);
      if (!before) return 'not-found';
      const auditEntry = entry(
        'catalog.attribute_value_deleted',
        { type: 'product_attribute_value', id: String(id), reference: String(before.product_id) },
        createAuditDiff(before, {
          ...before,
          value_text: null,
          value_number: null,
          value_boolean: null,
          value_reference: null,
          value_list_json: null,
        }, ['value_text', 'value_number', 'value_boolean', 'value_reference', 'value_list_json']),
      );
      return contentAudit.deleteAttributeValue(auditEntry, before);
    },

    async updateShippingRate(id: number, patch: ShippingRatePatch): Promise<AdminMutationOutcome> {
      const before = await fulfillment.findRate(id);
      if (before === null) return 'not-found';
      const after = {
        ...before,
        ...(patch.price_cents === undefined ? {} : { price_cents: patch.price_cents }),
        ...(patch.free_over_cents === undefined ? {} : { free_over_cents: patch.free_over_cents }),
        ...(patch.active === undefined ? {} : { active: patch.active ? 1 : 0 }),
      };
      const diff = createAuditDiff(before, after, ['price_cents', 'free_over_cents', 'active']);
      if (Object.keys(diff).length === 0) return 'unchanged';
      const entry = createAuditEntry(reserveIdentity(), {
        actor: ADMIN_ACTOR,
        action: 'fulfillment.shipping_rate_updated',
        entity: { type: 'shipping_rate', id: String(before.id), reference: before.label },
        diff,
      });
      return audit.updateShippingRate(entry, before, patch);
    },
  });
}

export type AdminOperations = ReturnType<typeof createAdminOperations>;
