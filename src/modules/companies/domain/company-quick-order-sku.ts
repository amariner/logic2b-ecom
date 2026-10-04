// Perfil interno compartido: no forma parte del barrel público ni normaliza la identidad.
export const MAX_COMPANY_QUICK_ORDER_SKU_LENGTH = 100;
export function isCompanyQuickOrderSku(input: unknown): input is string {
  return typeof input === 'string' && input.length >= 1 && input.length <= MAX_COMPANY_QUICK_ORDER_SKU_LENGTH
    && /^[\p{L}\p{M}\p{N}\p{P}\p{S} ]+$/u.test(input) && /[\p{L}\p{N}\p{P}\p{S}]/u.test(input)
    && !/\p{Default_Ignorable_Code_Point}/u.test(input);
}
