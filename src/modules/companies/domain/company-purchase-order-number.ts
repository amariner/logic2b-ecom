/** Perfil léxico privado compartido; conservar el texto exacto no acredita un documento. */
export const COMPANY_PURCHASE_ORDER_NUMBER_LENGTH = 120;

export function isCompanyPurchaseOrderNumber(input: unknown): input is string {
  return typeof input === 'string' && input.length >= 1 && input.length <= COMPANY_PURCHASE_ORDER_NUMBER_LENGTH &&
    !input.endsWith(' ') && /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._\/#-]*$/u.test(input) &&
    !/\p{Default_Ignorable_Code_Point}|\u20e3/u.test(input);
}
