import { createPublicDemoManifest } from './src/platform/configuration';

/**
 * Fuente de capacidades de este despliegue. Es configuración del motor
 * clonable. La muestra pública conserva todas las pantallas con fixtures, sin
 * habilitar jobs ni efectos comerciales.
 */
export const platformManifest = createPublicDemoManifest({
  id: 'logic2b-ecommerce-demo',
  environment: 'production',
});
