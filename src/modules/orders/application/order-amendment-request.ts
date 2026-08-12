import { z } from 'zod';

const existingLineSchema = z.object({
  order_item_id: z.number().int().positive(),
  quantity: z.number().int().min(0).max(999),
}).strict();

const newLineSchema = z.object({
  variant_id: z.number().int().positive(),
  quantity: z.number().int().min(0).max(999),
}).strict();

export const orderAmendmentAddressSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).nullable().default(null),
  street: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(100),
  postal_code: z.string().trim().regex(/^\d{5}$/, 'CP de 5 dígitos'),
  nif: z.string().trim().max(20).nullable().default(null),
  company: z.string().trim().max(160).nullable().default(null),
}).strict();

export const orderAmendmentPreviewSchema = z.object({
  order_id: z.number().int().positive(),
  expected_version: z.number().int().positive(),
  lines: z.array(z.union([existingLineSchema, newLineSchema])).max(100),
  address: orderAmendmentAddressSchema.optional(),
}).strict();

export const orderAmendmentCreateSchema = orderAmendmentPreviewSchema.extend({
  reason: z.string().trim().min(1).max(240),
  idempotency_key: z.string().uuid(),
}).strict();

