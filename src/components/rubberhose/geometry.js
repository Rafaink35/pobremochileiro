// Proporções por tipo de corpo (viewBox 400x560, centro em x=200). Todas as peças usam estes números,
// para que roupas, mochilas e acessórios encaixem em qualquer corpo.
export const CX = 200;
export const HEAD = { cx: 200, cy: 150 };

export const BODIES = {
  magro: { label: 'Magro', torsoRx: 40, torsoRy: 78, cy: 292, shoulderDx: 46, shoulderY: 236, hipDx: 20, hipY: 352, footDx: 34, legW: 14, armW: 12, headRx: 56, headRy: 62, shape: 'ellipse' },
  medio: { label: 'Médio', torsoRx: 56, torsoRy: 76, cy: 292, shoulderDx: 62, shoulderY: 238, hipDx: 26, hipY: 354, footDx: 42, legW: 18, armW: 15, headRx: 60, headRy: 64, shape: 'ellipse' },
  gordo: { label: 'Gordo', torsoRx: 90, torsoRy: 82, cy: 296, shoulderDx: 82, shoulderY: 244, hipDx: 38, hipY: 366, footDx: 58, legW: 24, armW: 20, headRx: 68, headRy: 66, shape: 'ellipse' },
  robusto: { label: 'Robusto', torsoRx: 76, torsoRy: 78, cy: 292, shoulderDx: 92, shoulderY: 236, hipDx: 32, hipY: 358, footDx: 52, legW: 22, armW: 22, headRx: 62, headRy: 64, shape: 'barrel' },
};

/** Contorno do tronco (usado também como recorte da roupa). */
export function torsoPath(b) {
  const { torsoRx: rx, torsoRy: ry, cy } = b;
  if (b.shape === 'barrel') {
    const x = CX - rx;
    const y = cy - ry;
    const w = rx * 2;
    const h = ry * 2;
    const r = 46;
    return `M${x + r} ${y} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
  }
  return `M${CX - rx} ${cy} a${rx} ${ry} 0 1 0 ${rx * 2} 0 a${rx} ${ry} 0 1 0 ${-rx * 2} 0 Z`;
}
