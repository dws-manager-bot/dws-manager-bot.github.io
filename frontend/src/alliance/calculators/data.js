/* Each calculator's game data is its own download, fetched when the page that
   needs it opens, so the list of calculators costs nothing to show. */
const FILES = {
  'precision-parts': () => import('./data/precision-parts.json'),
  vehicle: () => import('./data/vehicle.json'),
  'hero-weapons': () => import('./data/hero-weapons.json'),
  'hero-stars': () => import('./data/hero-stars.json'),
  'hero-equipment': () => import('./data/hero-equipment.json'),
  'vehicle-chips': () => import('./data/vehicle-chips.json'),
}

export const loadData = (name) => FILES[name]().then((m) => m.default)
