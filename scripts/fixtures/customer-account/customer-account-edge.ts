/**
 * El binding Cloudflare de rate limit no existe en la fixture visual. Su
 * contrato real se prueba por separado; este seam solo permite recorrer GET y
 * la confirmación POST ficticia dentro del navegador local aislado.
 */
export async function enforceCustomerAccountEdgeRate(): Promise<null> {
  return null;
}
