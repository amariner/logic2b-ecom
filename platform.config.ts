import { createPublicDemoManifest } from './src/platform/configuration';

/**
 * Fuente de capacidades de este despliegue. Es configuración del motor interno
 * reutilizable; no representa un SaaS ni una plantilla comercial. La muestra
 * pública conserva todas las pantallas con fixtures, sin habilitar jobs ni
 * efectos comerciales.
 */
export const platformManifest = createPublicDemoManifest({
  id: 'logic2b-ecommerce-demo',
  environment: 'production',
});
