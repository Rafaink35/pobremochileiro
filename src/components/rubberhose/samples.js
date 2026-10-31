// Três personagens de amostra, bem diferentes entre si.
export const SAMPLES = [
  {
    name: 'Dona Cida',
    bg: { base: '#F4C542', ray: '#f7d56b' },
    cfg: {
      body: 'gordo', skin: '#8a5233',
      hair: { style: 'cacheado', color: '#2a1a14' },
      headgear: { type: 'turbante', color: '#E8785D', color2: '#F4C542' },
      eyes: 'grande', mouth: 'sorriso', brows: 'alegre',
      outfit: { type: 'colete', color: '#0B3D2E', color2: '#1f7a5a', sleeve: '#f6f0e4' },
      pants: { color: '#d94a3d', long: true },
      shoes: '#2aa6a6',
      backpack: { type: 'cargueira', color: '#E8785D', color2: '#0B3D2E', strap: '#F4C542' },
      pose: { l: 'hip', r: 'wave' },
    },
  },
  {
    name: 'Teco',
    bg: { base: '#2aa6a6', ray: '#47bdbd' },
    cfg: {
      body: 'magro', skin: '#4a2a1c',
      hair: { style: 'dreads', color: '#14100d' },
      eyes: 'feliz', mouth: 'gargalhada', brows: 'alegre',
      glasses: { type: 'redondo', color: '#F4C542' },
      outfit: { type: 'listrada', color: '#f6f0e4', color2: '#d94a3d', sleeve: '#f6f0e4' },
      pants: { color: '#F4C542', long: false },
      shoes: '#0B3D2E',
      backpack: { type: 'diaria', color: '#8e5bd1', color2: '#F4C542', strap: '#F4C542' },
      pose: { l: 'wave', r: 'down' },
    },
  },
  {
    name: 'Lu',
    bg: { base: '#8e5bd1', ray: '#a374df' },
    cfg: {
      body: 'robusto', skin: '#d9a273',
      hair: { style: 'moicano', color: '#1fb5b5' },
      headgear: { type: 'bandana', color: '#d94a3d', color2: '#f6f0e4' },
      eyes: 'grande', mouth: 'safado', brows: 'safado', look: 1,
      outfit: { type: 'macacao', color: '#2c5f8a', color2: '#f4c542', sleeve: '#F4C542' },
      pants: { color: '#2c5f8a', long: true },
      shoes: '#F4C542',
      backpack: { type: 'cargueira', color: '#0B3D2E', color2: '#E8785D', strap: '#E8785D' },
      pose: { l: 'down', r: 'thumb' },
    },
  },
];
