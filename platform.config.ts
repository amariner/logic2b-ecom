import { createPresetManifest } from './src/platform/configuration';

/**
 * Fuente de capacidades de este despliegue. Es configuración del motor
 * clonable; R1.2 no la conecta todavía a rutas, navegación, jobs ni UI.
 */
export const platformManifest = createPresetManifest('minimal', {
  id: 'logic2b-ecommerce-demo',
  mode: 'demo',
  environment: 'production',
});
