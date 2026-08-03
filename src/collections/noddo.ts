/**
 * Colección `noddo` — NODDO Living Systems.
 *
 * PRESENTACIÓN, no motor: identidad, copy y categorías del escaparate.
 * Nada de aquí influye en lo que se cobra, se envía o dice un email.
 */
import type { CollectionConfig } from './types';

export const noddoCollection: CollectionConfig = {
  id: 'noddo',
  themeId: 'noddo',

  name: 'NODDO',
  tagline: 'Objetos que piensan en silencio.',
  description: 'Tecnología doméstica serena: clima, luz, aire, energía, acceso y sonido diseñados para desaparecer en el espacio.',

  // TODO(tema noddo): categorías reales del catálogo (los ids son los valores
  // de products.category en el seed y de ?categoria= en la URL).
  categories: [
    { id: 'nod-clima', label: 'Clima' },
    { id: 'nod-luz', label: 'Luz' },
    { id: 'nod-aire', label: 'Aire' },
    { id: 'nod-energia', label: 'Energía' },
    { id: 'nod-acceso', label: 'Acceso' },
    { id: 'nod-sonido', label: 'Sonido' },
  ],
};
