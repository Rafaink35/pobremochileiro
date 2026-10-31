import { INK, Ink, shade } from './ink.jsx';
import { CX } from './geometry.js';

/* ---------- Cabelo (atrás da cabeça e na frente) ---------- */
const blob = (cx, cy, r, color, key) => (
  <circle key={key} cx={cx} cy={cy} r={r} fill={color} stroke={INK} strokeWidth="5.5" />
);

export function HairBack({ style, color, head }) {
  const { cx, cy, rx, ry } = head;
  if (style === 'cacheado') {
    const pts = [[-1.05, -0.1, 34], [-0.95, -0.55, 38], [-0.6, -0.95, 40], [0, -1.15, 44], [0.6, -0.95, 40], [0.95, -0.55, 38], [1.05, -0.1, 34], [-1.0, 0.35, 28], [1.0, 0.35, 28]];
    return <g>{pts.map(([a, b, r], i) => blob(cx + a * rx, cy + b * ry, r, color, i))}</g>;
  }
  if (style === 'dreads') {
    // maria-chiquinha de dreads amarrados em coque no topo + mechas caindo
    return (
      <g>
        {[-1, -0.55, 0, 0.55, 1].map((k, i) => (
          <path key={i} d={`M${cx + k * rx * 0.7} ${cy - ry * 0.6} Q${cx + k * rx * 1.5} ${cy + ry * 0.2} ${cx + k * rx * 1.25} ${cy + ry * 1.05}`}
            fill="none" stroke={INK} strokeWidth="22" strokeLinecap="round" />
        ))}
        {[-1, -0.55, 0, 0.55, 1].map((k, i) => (
          <path key={'c' + i} d={`M${cx + k * rx * 0.7} ${cy - ry * 0.6} Q${cx + k * rx * 1.5} ${cy + ry * 0.2} ${cx + k * rx * 1.25} ${cy + ry * 1.05}`}
            fill="none" stroke={color} strokeWidth="13" strokeLinecap="round" />
        ))}
      </g>
    );
  }
  if (style === 'moicano') return null;
  if (style === 'longo') {
    return <Ink d={`M${cx - rx * 1.05} ${cy - 10} Q${cx - rx * 1.2} ${cy + ry * 1.6} ${cx - rx * 0.4} ${cy + ry * 1.5} L${cx + rx * 0.4} ${cy + ry * 1.5} Q${cx + rx * 1.2} ${cy + ry * 1.6} ${cx + rx * 1.05} ${cy - 10} Z`} fill={color} />;
  }
  return null;
}

export function HairFront({ style, color, head }) {
  const { cx, cy, rx, ry } = head;
  const hi = shade(color, 0.25);
  if (style === 'cacheado') {
    return (
      <g>
        <path d={`M${cx - rx * 0.92} ${cy - ry * 0.35} Q${cx - rx * 0.5} ${cy - ry * 1.15} ${cx} ${cy - ry * 1.0} Q${cx + rx * 0.5} ${cy - ry * 1.15} ${cx + rx * 0.92} ${cy - ry * 0.35} Q${cx + rx * 0.55} ${cy - ry * 0.55} ${cx} ${cy - ry * 0.5} Q${cx - rx * 0.55} ${cy - ry * 0.55} ${cx - rx * 0.92} ${cy - ry * 0.35} Z`} fill={color} stroke={INK} strokeWidth="5.5" strokeLinejoin="round" />
        <path d={`M${cx - 30} ${cy - ry * 0.85} q10 -10 22 -2`} stroke={hi} strokeWidth="5" fill="none" strokeLinecap="round" />
      </g>
    );
  }
  if (style === 'dreads') {
    return (
      <g>
        <path d={`M${cx - rx * 0.95} ${cy - ry * 0.3} Q${cx - rx * 0.6} ${cy - ry * 1.05} ${cx} ${cy - ry * 0.95} Q${cx + rx * 0.6} ${cy - ry * 1.05} ${cx + rx * 0.95} ${cy - ry * 0.3} Q${cx + rx * 0.5} ${cy - ry * 0.5} ${cx} ${cy - ry * 0.45} Q${cx - rx * 0.5} ${cy - ry * 0.5} ${cx - rx * 0.95} ${cy - ry * 0.3} Z`} fill={color} stroke={INK} strokeWidth="5.5" strokeLinejoin="round" />
        {[-1, 0, 1].map((k) => (
          <path key={k} d={`M${cx + k * 26} ${cy - ry * 0.95} Q${cx + k * 34} ${cy - ry * 0.7} ${cx + k * 22} ${cy - ry * 0.48}`} stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        ))}
      </g>
    );
  }
  if (style === 'moicano') {
    const spikes = [-0.55, -0.28, 0, 0.28, 0.55];
    return (
      <g>
        {spikes.map((k, i) => {
          const x = cx + k * rx * 0.85;
          const baseY = cy - ry * (0.92 - Math.abs(k) * 0.35);
          const h = 62 - Math.abs(k) * 55;
          return <path key={i} d={`M${x - 18} ${baseY + 6} Q${x + k * 30} ${baseY - h * 0.6} ${x + k * 55} ${baseY - h - 14} Q${x + 12} ${baseY - h * 0.2} ${x + 18} ${baseY + 6} Z`} fill={color} stroke={INK} strokeWidth="5.5" strokeLinejoin="round" />;
        })}
        <path d={`M${cx - rx * 0.4} ${cy - ry * 0.92} Q${cx} ${cy - ry * 1.05} ${cx + rx * 0.4} ${cy - ry * 0.92} L${cx + rx * 0.35} ${cy - ry * 0.75} Q${cx} ${cy - ry * 0.85} ${cx - rx * 0.35} ${cy - ry * 0.75} Z`} fill={color} />
      </g>
    );
  }
  return null;
}

/* ---------- Acessórios de cabeça ---------- */
export function Headgear({ type, color, color2, head }) {
  const { cx, cy, rx, ry } = head;
  if (type === 'turbante') {
    return (
      <g>
        <path d={`M${cx - rx * 0.98} ${cy - ry * 0.25} Q${cx - rx * 1.05} ${cy - ry * 1.15} ${cx} ${cy - ry * 1.28} Q${cx + rx * 1.05} ${cy - ry * 1.15} ${cx + rx * 0.98} ${cy - ry * 0.25} Q${cx} ${cy - ry * 0.62} ${cx - rx * 0.98} ${cy - ry * 0.25} Z`} fill={color} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
        {[0.2, 0.45, 0.7].map((t, i) => (
          <path key={i} d={`M${cx - rx * (0.95 - t * 0.2)} ${cy - ry * (0.28 + t * 0.55)} Q${cx} ${cy - ry * (0.62 + t * 0.62)} ${cx + rx * (0.95 - t * 0.2)} ${cy - ry * (0.28 + t * 0.55)}`} fill="none" stroke={color2} strokeWidth="5" strokeLinecap="round" />
        ))}
        <circle cx={cx + rx * 0.45} cy={cy - ry * 0.95} r="13" fill={color2} stroke={INK} strokeWidth="5" />
        <path d={`M${cx + rx * 0.45} ${cy - ry * 0.95} m-6 0 a6 6 0 1 1 12 0`} stroke={INK} strokeWidth="3" fill="none" />
      </g>
    );
  }
  if (type === 'bandana') {
    return (
      <g>
        <path d={`M${cx - rx * 0.97} ${cy - ry * 0.35} Q${cx} ${cy - ry * 0.95} ${cx + rx * 0.97} ${cy - ry * 0.35} L${cx + rx * 0.9} ${cy - ry * 0.12} Q${cx} ${cy - ry * 0.7} ${cx - rx * 0.9} ${cy - ry * 0.12} Z`} fill={color} stroke={INK} strokeWidth="5.5" strokeLinejoin="round" />
        {[-0.6, -0.2, 0.2, 0.6].map((k, i) => <circle key={i} cx={cx + k * rx} cy={cy - ry * (0.52 - Math.abs(k) * 0.12)} r="4.5" fill={color2} />)}
        {/* nó com pontas */}
        <path d={`M${cx - rx * 0.92} ${cy - ry * 0.22} q-30 -4 -34 22 q16 -10 30 -6 Z`} fill={color} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
        <path d={`M${cx - rx * 0.92} ${cy - ry * 0.22} q-18 20 -4 38 q4 -18 8 -30 Z`} fill={color} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      </g>
    );
  }
  return null;
}

export function Glasses({ type, color, head }) {
  if (!type) return null;
  const { cx, cy } = head;
  const y = cy - 4;
  return (
    <g fill="none" stroke={color} strokeWidth="6">
      <circle cx={cx - 22} cy={y} r="19" fill="#fffdf6" fillOpacity=".4" stroke={INK} strokeWidth="9" />
      <circle cx={cx + 22} cy={y} r="19" fill="#fffdf6" fillOpacity=".4" stroke={INK} strokeWidth="9" />
      <circle cx={cx - 22} cy={y} r="19" />
      <circle cx={cx + 22} cy={y} r="19" />
      <path d={`M${cx - 3} ${y} h6`} stroke={INK} strokeWidth="6" strokeLinecap="round" />
      <path d={`M${cx - 41} ${y} L${cx - 58} ${y - 6} M${cx + 41} ${y} L${cx + 58} ${y - 6}`} stroke={INK} strokeWidth="6" strokeLinecap="round" />
    </g>
  );
}

/* ---------- Rosto ---------- */
function Eye({ x, y, look = 0, size = 1, style }) {
  // Olhos grandes de desenho antigo: branco enorme, pupila grande com brilho, pálpebra grossa.
  const w = 17 * size;
  const h = 22 * size;
  if (style === 'feliz') {
    return (
      <g>
        <path d={`M${x - w} ${y + 6} Q${x} ${y - h * 1.1} ${x + w} ${y + 6}`} fill="none" stroke={INK} strokeWidth="8" strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g>
      <ellipse cx={x} cy={y} rx={w} ry={h} fill="#fffdf6" stroke={INK} strokeWidth="5.5" />
      <ellipse cx={x + look * 5} cy={y + 3} rx={w * 0.58} ry={h * 0.66} fill={INK} />
      <ellipse cx={x + look * 5 - 4} cy={y - 4} rx={w * 0.2} ry={h * 0.2} fill="#fffdf6" />
      <path d={`M${x - w - 2} ${y - h * 0.55} Q${x} ${y - h * 1.15} ${x + w + 2} ${y - h * 0.55}`} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />
    </g>
  );
}

export function Face({ head, skin, eyes = 'grande', mouth = 'sorriso', brows = 'alegre', look = 0 }) {
  const { cx, cy, ry } = head;
  const ex = 22;
  const ey = cy - 6;
  const my = cy + ry * 0.42;
  const dark = shade(skin, -0.28);
  return (
    <g>
      {/* bochechas */}
      <ellipse cx={cx - 40} cy={cy + 26} rx="12" ry="8" fill="#e8603f" opacity=".35" />
      <ellipse cx={cx + 40} cy={cy + 26} rx="12" ry="8" fill="#e8603f" opacity=".35" />
      <Eye x={cx - ex} y={ey} look={look} style={eyes} />
      <Eye x={cx + ex} y={ey} look={look} style={eyes} size={eyes === 'grande' ? 1.0 : 1} />
      {/* sobrancelhas */}
      {brows === 'alegre' && <path d={`M${cx - 44} ${ey - 34} Q${cx - 24} ${ey - 46} ${cx - 6} ${ey - 32} M${cx + 6} ${ey - 32} Q${cx + 24} ${ey - 46} ${cx + 44} ${ey - 34}`} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />}
      {brows === 'safado' && <path d={`M${cx - 44} ${ey - 28} L${cx - 8} ${ey - 36} M${cx + 8} ${ey - 40} Q${cx + 26} ${ey - 52} ${cx + 44} ${ey - 40}`} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />}
      {brows === 'bravo' && <path d={`M${cx - 44} ${ey - 40} L${cx - 8} ${ey - 28} M${cx + 8} ${ey - 28} L${cx + 44} ${ey - 40}`} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />}
      {/* nariz */}
      <ellipse cx={cx} cy={cy + 20} rx="11" ry="9" fill={shade(skin, -0.1)} stroke={INK} strokeWidth="5" />
      <ellipse cx={cx - 3} cy={cy + 17} rx="3" ry="2.4" fill={shade(skin, 0.35)} />
      {/* boca */}
      {mouth === 'sorriso' && (
        <g>
          <path d={`M${cx - 36} ${my - 2} Q${cx} ${my + 52} ${cx + 36} ${my - 2} Q${cx} ${my + 8} ${cx - 36} ${my - 2} Z`} fill="#3a0d12" stroke={INK} strokeWidth="5.5" strokeLinejoin="round" />
          <path d={`M${cx - 22} ${my + 14} Q${cx} ${my + 36} ${cx + 22} ${my + 14} Q${cx} ${my + 22} ${cx - 22} ${my + 14}`} fill="#e8556b" />
          <path d={`M${cx - 30} ${my} Q${cx} ${my + 12} ${cx + 30} ${my} L${cx + 28} ${my + 6} Q${cx} ${my + 17} ${cx - 28} ${my + 6} Z`} fill="#fffdf6" />
        </g>
      )}
      {mouth === 'gargalhada' && (
        <g>
          <path d={`M${cx - 38} ${my - 8} Q${cx} ${my + 70} ${cx + 38} ${my - 8} Q${cx} ${my + 2} ${cx - 38} ${my - 8} Z`} fill="#3a0d12" stroke={INK} strokeWidth="5.5" strokeLinejoin="round" />
          <path d={`M${cx - 30} ${my - 4} Q${cx} ${my + 8} ${cx + 30} ${my - 4} L${cx + 28} ${my + 4} Q${cx} ${my + 15} ${cx - 28} ${my + 4} Z`} fill="#fffdf6" />
          <ellipse cx={cx} cy={my + 28} rx="17" ry="11" fill="#e8556b" />
        </g>
      )}
      {mouth === 'safado' && (
        <g>
          <path d={`M${cx - 30} ${my + 8} Q${cx - 4} ${my + 14} ${cx + 32} ${my - 8}`} fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
          <path d={`M${cx + 32} ${my - 8} q6 -2 8 -9`} fill="none" stroke={INK} strokeWidth="5.5" strokeLinecap="round" />
          <path d={`M${cx - 6} ${my + 8} l4 10 l8 -8 Z`} fill="#fffdf6" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        </g>
      )}
      <path d={`M${cx - 6} ${cy + 36} q6 4 12 0`} stroke={dark} strokeWidth="0" fill="none" />
    </g>
  );
}

/* ---------- Sapatos ---------- */
export function Shoe({ x, y, color, flip = false, kind = 'tenis' }) {
  const s = flip ? -1 : 1;
  return (
    <g transform={`translate(${x} ${y}) scale(${s} 1)`}>
      <path d="M-26 -4 Q-30 -26 -8 -26 Q10 -26 14 -14 Q46 -14 46 6 Q46 20 28 20 L-22 20 Q-34 20 -26 -4 Z" fill={color} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      <path d="M-30 14 L44 14" stroke={INK} strokeWidth="5" />
      <path d="M-28 15 L44 15 L44 19 Q44 22 36 22 L-22 22 Q-30 22 -28 15Z" fill="#fffdf6" />
      <path d="M22 -14 Q34 -12 38 -2" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
      {kind === 'tenis' && <path d="M-4 -22 l8 8 M6 -22 l8 8" stroke="#fffdf6" strokeWidth="4" strokeLinecap="round" />}
    </g>
  );
}

/* ---------- Mochila ---------- */
export function PackBack({ type, color, color2, b }) {
  if (!type) return null;
  const w = b.torsoRx + 26;
  const top = b.cy - b.torsoRy - 40;
  const h = b.torsoRy * 2 + 8;
  return (
    <g>
      {/* rolo de dormir no topo */}
      {type === 'cargueira' && <rect x={CX - w + 4} y={top - 20} width={w * 2 - 8} height="30" rx="15" fill={color2} stroke={INK} strokeWidth="6" />}
      <rect x={CX - w} y={top} width={w * 2} height={h} rx="42" fill={color} stroke={INK} strokeWidth="6.5" />
      <path d={`M${CX - w + 14} ${top + 22} q-6 40 0 80`} stroke="#ffffff55" strokeWidth="6" fill="none" strokeLinecap="round" />
      {/* bolsos laterais */}
      <rect x={CX - w - 12} y={top + h * 0.45} width="30" height="64" rx="14" fill={color2} stroke={INK} strokeWidth="5.5" />
      <rect x={CX + w - 18} y={top + h * 0.45} width="30" height="64" rx="14" fill={color2} stroke={INK} strokeWidth="5.5" />
    </g>
  );
}

export function PackStraps({ color, b }) {
  const sx = b.torsoRx * 0.52;
  const top = b.cy - b.torsoRy + 4;
  return (
    <g>
      {[-1, 1].map((k) => (
        <g key={k}>
          <path d={`M${CX + k * sx} ${top} Q${CX + k * (sx + 8)} ${b.cy - 10} ${CX + k * (sx - 6)} ${b.cy + b.torsoRy - 16}`} fill="none" stroke={INK} strokeWidth="19" strokeLinecap="round" />
          <path d={`M${CX + k * sx} ${top} Q${CX + k * (sx + 8)} ${b.cy - 10} ${CX + k * (sx - 6)} ${b.cy + b.torsoRy - 16}`} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" />
        </g>
      ))}
      {/* fivela peitoral */}
      <path d={`M${CX - sx} ${b.cy - 18} H${CX + sx}`} stroke={INK} strokeWidth="12" strokeLinecap="round" />
      <path d={`M${CX - sx} ${b.cy - 18} H${CX + sx}`} stroke={color} strokeWidth="5" strokeLinecap="round" />
      <rect x={CX - 8} y={b.cy - 27} width="16" height="18" rx="4" fill="#F4C542" stroke={INK} strokeWidth="4.5" />
    </g>
  );
}

/* ---------- Roupas ---------- */
export function Outfit({ type, color, color2, b, clipId }) {
  const top = b.cy - b.torsoRy;
  const bot = b.cy + b.torsoRy;
  const x0 = CX - b.torsoRx - 4;
  const w = (b.torsoRx + 4) * 2;
  return (
    <g clipPath={`url(#${clipId})`}>
      <rect x={x0} y={top - 4} width={w} height={bot - top + 8} fill={color} />
      {type === 'listrada' && [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={x0} y={top + 6 + i * 22} width={w} height="10" fill={color2} />)}
      {type === 'colete' && (
        <>
          <rect x={CX - 10} y={top - 4} width="20" height={bot - top + 8} fill={color2} />
          <path d={`M${CX - b.torsoRx - 4} ${top} L${CX - 14} ${top} L${CX - 4} ${b.cy + 30} L${CX - b.torsoRx - 4} ${b.cy + 40} Z`} fill={color} />
          <path d={`M${CX + b.torsoRx + 4} ${top} L${CX + 14} ${top} L${CX + 4} ${b.cy + 30} L${CX + b.torsoRx + 4} ${b.cy + 40} Z`} fill={color} />
          {[0, 1, 2].map((i) => <circle key={i} cx={CX} cy={b.cy - 20 + i * 26} r="5.5" fill="#F4C542" stroke={INK} strokeWidth="3" />)}
        </>
      )}
      {type === 'macacao' && (
        <>
          <rect x={x0} y={top - 4} width={w} height={(bot - top) * 0.34} fill={color2} />
          <rect x={CX - 28} y={b.cy + 2} width="56" height="40" rx="8" fill={shade(color, -0.12)} stroke={INK} strokeWidth="4.5" />
          <path d={`M${CX - 22} ${b.cy + 14} H${CX + 22}`} stroke={INK} strokeWidth="3" strokeDasharray="5 5" />
        </>
      )}
      {/* sombra de dobra */}
      <ellipse cx={CX + b.torsoRx * 0.55} cy={b.cy + 14} rx={b.torsoRx * 0.5} ry={b.torsoRy * 0.9} fill="#00000018" />
    </g>
  );
}
