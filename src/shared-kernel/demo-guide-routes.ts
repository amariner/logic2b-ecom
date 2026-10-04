/** Destinos locales del gestor público; nunca acepta una URL externa ni el login. */
export function demoAdminNextPath(raw: string): string {
  const [path = ''] = raw.split('?');
  const allowed = /^\/demo\/admin(?:\/(?:pedidos\/[a-zA-Z0-9_-]+|productos(?:\/\d+)?|envios|emails|ubicaciones|transferencias|conteos|asignacion|devoluciones|documentos|segmentos|empresas|catalogos-empresa|mercados|publicacion|impuestos|divisas))?$/;
  return allowed.test(path) && !raw.includes('\\') && !raw.includes('#') && !/[\u0000-\u0020\u007f]/.test(raw) ? raw : '/demo/admin';
}

export function demoAdminEntryHref(destination = '/demo/admin'): string {
  return `/demo/admin/login?tour=1&next=${encodeURIComponent(demoAdminNextPath(destination))}`;
}
