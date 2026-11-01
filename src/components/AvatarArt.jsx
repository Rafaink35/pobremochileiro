import { MascotArt } from './MascotArt.jsx';
import { BACKGROUNDS, HAIR_COLORS, PINS, SHIRTS, SKIN_TONES, find, normalizeAvatar } from '../services/avatar/model.js';

// Arte dos avatares em SVG simples (formas básicas, no estilo do logo). Só IDs do catálogo são desenhados:
// nada que venha do banco vira código SVG. Um(a) ilustrador(a) pode trocar este arquivo sem mexer nos perfis.

const BODY = {
  magro: { shoulder: 27, faceRx: 17, faceRy: 21, strap: 11 },
  medio: { shoulder: 34, faceRx: 19, faceRy: 22, strap: 14 },
  gordo: { shoulder: 46, faceRx: 24, faceRy: 24, strap: 19 },
};
const INK = '#2a1a12';

function darker(hex, amount = 0.18) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.round(v * (1 - amount)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function Hair({ style, color, b, cx, back }) {
  const rx = b.faceRx;
  const top = 48 - b.faceRy;
  if (style === 'careca') return null;
  if (back) {
    if (style === 'longo') return <path d={`M${cx - rx - 3} 46 Q${cx - rx - 6} 98 ${cx - rx + 2} 98 L${cx + rx - 2} 98 Q${cx + rx + 6} 98 ${cx + rx + 3} 46 Z`} fill={color} />;
    if (style === 'black') return <circle cx={cx} cy={top + 6} r={rx + 13} fill={color} />;
    if (style === 'trancas') return (
      <>
        {[-1, 1].map((s) => <rect key={s} x={cx + s * (rx + 1) - 3.5} y={46} width={7} height={52} rx={3.5} fill={color} />)}
        {[-1, 1].map((s) => [58, 70, 82].map((y) => <line key={`${s}${y}`} x1={cx + s * (rx + 1) - 3.5} x2={cx + s * (rx + 1) + 3.5} y1={y} y2={y} stroke={INK} strokeOpacity=".35" />))}
      </>
    );
    if (style === 'cacheado') return <>{[-1, 0, 1].map((i) => <circle key={i} cx={cx + i * (rx - 2)} cy={top + 8 + Math.abs(i) * 6} r={11} fill={color} />)}<circle cx={cx} cy={top + 1} r={12} fill={color} /></>;
    return null;
  }
  const cap = `M${cx - rx} 47 C${cx - rx} ${top - 6}, ${cx + rx} ${top - 6}, ${cx + rx} 47 C${cx + rx - 3} ${top + 12}, ${cx - rx + 3} ${top + 12}, ${cx - rx} 47 Z`;
  if (style === 'raspado') return <path d={cap} fill={color} opacity=".55" />;
  if (style === 'coque') return <><circle cx={cx} cy={top - 4} r={9} fill={color} /><path d={cap} fill={color} /></>;
  if (style === 'black') return <path d={`M${cx - rx + 2} 42 Q${cx} ${top + 8} ${cx + rx - 2} 42 Q${cx} ${top + 16} ${cx - rx + 2} 42 Z`} fill={color} />;
  if (style === 'cacheado') return <path d={`M${cx - rx} 44 Q${cx} ${top + 4} ${cx + rx} 44 Q${cx} ${top + 14} ${cx - rx} 44 Z`} fill={color} />;
  return <path d={cap} fill={color} />; // curto, longo, trancas
}

function Hat({ type, shirtHex, cx, b }) {
  const rx = b.faceRx;
  const top = 48 - b.faceRy;
  if (type === 'bone') return <><path d={`M${cx - rx - 1} 40 C${cx - rx} ${top - 8}, ${cx + rx} ${top - 8}, ${cx + rx + 1} 40 Z`} fill={shirtHex} stroke={INK} strokeWidth="1.5" /><path d={`M${cx - 2} 40 Q${cx + rx + 9} 38 ${cx + rx + 10} 43 L${cx - 2} 44 Z`} fill={darker(shirtHex, 0.25)} stroke={INK} strokeWidth="1.5" /></>;
  if (type === 'aba') return <><ellipse cx={cx} cy={38} rx={rx + 15} ry={5} fill="#c9a36a" stroke={INK} strokeWidth="1.5" /><path d={`M${cx - rx + 2} 38 C${cx - rx + 2} ${top - 8}, ${cx + rx - 2} ${top - 8}, ${cx + rx - 2} 38 Z`} fill="#c9a36a" stroke={INK} strokeWidth="1.5" /><rect x={cx - rx + 2} y={33} width={rx * 2 - 4} height={4} fill={shirtHex} /></>;
  if (type === 'gorro') return <><path d={`M${cx - rx} 41 C${cx - rx} ${top - 10}, ${cx + rx} ${top - 10}, ${cx + rx} 41 Z`} fill={shirtHex} stroke={INK} strokeWidth="1.5" /><rect x={cx - rx - 1} y={38} width={rx * 2 + 2} height={7} rx={3} fill={darker(shirtHex, 0.2)} stroke={INK} strokeWidth="1.5" /><circle cx={cx} cy={top - 6} r={3.5} fill={darker(shirtHex, 0.2)} /></>;
  if (type === 'turbante') return <><path d={`M${cx - rx - 2} 44 C${cx - rx - 4} ${top - 10}, ${cx + rx + 4} ${top - 10}, ${cx + rx + 2} 44 C${cx + rx} 36 ${cx - rx} 36 ${cx - rx - 2} 44 Z`} fill={shirtHex} stroke={INK} strokeWidth="1.5" /><path d={`M${cx - rx} ${top + 2} Q${cx} ${top + 10} ${cx + rx} ${top - 2} M${cx - rx + 2} ${top + 10} Q${cx} ${top + 18} ${cx + rx} ${top + 8}`} stroke={darker(shirtHex, 0.3)} strokeWidth="1.5" fill="none" /></>;
  if (type === 'bandana') return <><path d={`M${cx - rx - 1} 38 Q${cx} 34 ${cx + rx + 1} 38 L${cx + rx + 1} 43 Q${cx} 39 ${cx - rx - 1} 43 Z`} fill={shirtHex} stroke={INK} strokeWidth="1.5" /><path d={`M${cx + rx} 40 l9 -4 l0 10 Z`} fill={shirtHex} stroke={INK} strokeWidth="1.5" /></>;
  return null;
}

function Face({ mood, cx }) {
  const eye = (x) => <circle key={x} cx={x} cy={48} r={2.2} fill={INK} />;
  return (
    <>
      {eye(cx - 7)}
      {eye(cx + 7)}
      {mood === 'neutro' && <path d={`M${cx - 5} 59 H${cx + 5}`} stroke={INK} strokeWidth="2" strokeLinecap="round" />}
      {mood === 'sorrindo' && <path d={`M${cx - 7} 57 Q${cx} 65 ${cx + 7} 57`} stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />}
      {mood === 'animado' && <path d={`M${cx - 7} 57 Q${cx} 68 ${cx + 7} 57 Z`} fill={INK} />}
    </>
  );
}

function Glasses({ type, cx }) {
  if (type === 'redondo') return <g fill="none" stroke={INK} strokeWidth="1.8"><circle cx={cx - 7} cy={48} r={5.5} /><circle cx={cx + 7} cy={48} r={5.5} /><path d={`M${cx - 1.5} 48 h3`} /></g>;
  if (type === 'quadrado') return <g fill="none" stroke={INK} strokeWidth="1.8"><rect x={cx - 13} y={43} width={11} height={9} rx={2} /><rect x={cx + 2} y={43} width={11} height={9} rx={2} /><path d={`M${cx - 2} 47 h4`} /></g>;
  if (type === 'sol') return <g stroke={INK} strokeWidth="1.8"><rect x={cx - 14} y={43} width={12} height={9} rx={3} fill={INK} /><rect x={cx + 2} y={43} width={12} height={9} rx={3} fill={INK} /><path d={`M${cx - 2} 46 h4`} fill="none" /></g>;
  return null;
}

function Facial({ type, color, cx, b }) {
  const rx = b.faceRx;
  if (type === 'barba') return <path d={`M${cx - rx} 50 Q${cx - rx} ${48 + b.faceRy + 2} ${cx} ${48 + b.faceRy + 3} Q${cx + rx} ${48 + b.faceRy + 2} ${cx + rx} 50 Q${cx + rx - 4} 58 ${cx} 58 Q${cx - rx + 4} 58 ${cx - rx} 50 Z`} fill={color} opacity=".9" />;
  if (type === 'bigode') return <path d={`M${cx - 8} 55 Q${cx} 51 ${cx + 8} 55 Q${cx} 58 ${cx - 8} 55 Z`} fill={color} />;
  if (type === 'cavanhaque') return <ellipse cx={cx} cy={48 + b.faceRy - 2} rx={5} ry={4} fill={color} />;
  return null;
}

function Pin({ id, cx }) {
  const stripes = find(PINS, id).stripes;
  if (!stripes) return null;
  const h = 12 / stripes.length;
  return (
    <g>
      <rect x={cx - 31} y={96} width={18} height={12} fill="#fff" stroke={INK} strokeWidth="1.2" />
      {stripes.map((c, i) => <rect key={`${c}${i}`} x={cx - 31} y={96 + i * h} width={18} height={h} fill={c} />)}
      <rect x={cx - 31} y={96} width={18} height={12} fill="none" stroke={INK} strokeWidth="1.2" />
    </g>
  );
}

function Person({ a }) {
  const b = BODY[a.body];
  const cx = 60;
  const skin = find(SKIN_TONES, a.skin).hex;
  const hair = find(HAIR_COLORS, a.hairColor).hex;
  const shirt = find(SHIRTS, a.shirt).hex;
  const faceTop = 48 + b.faceRy;
  return (
    <g>
      <Hair style={a.hair} color={hair} b={b} cx={cx} back />
      <ellipse cx={cx} cy={126} rx={b.shoulder} ry={42} fill={shirt} stroke={INK} strokeWidth="1.5" />
      <rect x={cx - 6} y={faceTop - 8} width={12} height={18} fill={darker(skin)} />
      {[-1, 1].map((s) => <rect key={s} x={cx + s * b.strap - 3} y={86} width={6} height={34} rx={3} fill="#0b3d2e" opacity=".85" />)}
      <path d={`M${cx - 9} ${faceTop + 6} Q${cx} ${faceTop + 14} ${cx + 9} ${faceTop + 6}`} fill={skin} stroke={INK} strokeWidth="1" />
      {[-1, 1].map((s) => <circle key={s} cx={cx + s * b.faceRx} cy={50} r={3.4} fill={skin} />)}
      <ellipse cx={cx} cy={48} rx={b.faceRx} ry={b.faceRy} fill={skin} stroke={INK} strokeWidth="1.2" />
      <Facial type={a.facial} color={hair} cx={cx} b={b} />
      <Face mood={a.mood} cx={cx} />
      <Glasses type={a.glasses} cx={cx} />
      <Hair style={a.hair} color={hair} b={b} cx={cx} />
      <Hat type={a.hat} shirtHex={shirt === find(BACKGROUNDS, a.bg).hex ? '#0b3d2e' : shirt} cx={cx} b={b} />
      <Pin id={a.pin} cx={cx + 12} />
    </g>
  );
}

const CREAM = '#fff8e9';
const ICON_ART = {
  mochila: <g fill="none" stroke={CREAM} strokeWidth="4" strokeLinejoin="round"><rect x="38" y="34" width="44" height="58" rx="14" /><path d="M46 34 v-6 a14 8 0 0 1 28 0 v6" /><rect x="46" y="64" width="28" height="18" rx="5" /><path d="M38 52 h44" /></g>,
  barraca: <g fill="none" stroke={CREAM} strokeWidth="4" strokeLinejoin="round"><path d="M60 28 L26 90 H94 Z" /><path d="M60 52 L48 90 H72 Z" fill={CREAM} fillOpacity=".25" /></g>,
  bussola: <g fill="none" stroke={CREAM} strokeWidth="4" strokeLinejoin="round"><circle cx="60" cy="60" r="32" /><path d="M60 36 L69 60 L60 84 L51 60 Z" fill={CREAM} fillOpacity=".4" /><circle cx="60" cy="60" r="3" fill={CREAM} /></g>,
  sol: <g stroke={CREAM} strokeWidth="4" strokeLinecap="round"><circle cx="60" cy="60" r="16" fill="none" />{Array.from({ length: 8 }, (_, i) => { const t = (i * Math.PI) / 4; return <line key={i} x1={60 + Math.cos(t) * 26} y1={60 + Math.sin(t) * 26} x2={60 + Math.cos(t) * 36} y2={60 + Math.sin(t) * 36} />; })}</g>,
  montanha: <g fill="none" stroke={CREAM} strokeWidth="4" strokeLinejoin="round"><path d="M22 90 L52 38 L72 70 L82 54 L100 90 Z" /><path d="M44 52 L52 38 L60 52 L52 48 Z" fill={CREAM} /></g>,
  onda: <g fill="none" stroke={CREAM} strokeWidth="4" strokeLinecap="round">{[44, 60, 76].map((y) => <path key={y} d={`M24 ${y} q9 -12 18 0 t18 0 t18 0 t18 0`} />)}</g>,
  onibus: <g fill="none" stroke={CREAM} strokeWidth="4" strokeLinejoin="round"><rect x="26" y="34" width="68" height="46" rx="10" /><path d="M26 56 H94" /><rect x="34" y="42" width="16" height="10" rx="2" /><rect x="70" y="42" width="16" height="10" rx="2" /><circle cx="42" cy="84" r="6" fill={CREAM} /><circle cx="78" cy="84" r="6" fill={CREAM} /></g>,
  aviao: <path d="M92 28 C96 28 98 32 94 36 L72 58 L78 92 L70 94 L58 66 L40 80 L40 90 L33 92 L32 78 L22 70 L24 63 L34 66 L52 52 L26 42 L28 34 L60 40 L82 30 Z" fill="none" stroke={CREAM} strokeWidth="3.5" strokeLinejoin="round" />,
  fogueira: <g fill="none" stroke={CREAM} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M60 26 C70 44 80 50 74 66 C70 76 50 76 46 66 C42 54 54 50 60 26 Z" /><path d="M30 92 L90 80 M30 80 L90 92" /></g>,
  mapa: <g fill="none" stroke={CREAM} strokeWidth="4" strokeLinejoin="round"><path d="M26 36 L48 30 L72 36 L94 30 V84 L72 90 L48 84 L26 90 Z" /><path d="M48 30 V84 M72 36 V90" /></g>,
  tenis: <g fill="none" stroke={CREAM} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"><path d="M24 80 V52 L40 46 C44 56 52 60 62 60 L88 66 C96 68 98 80 90 82 Z" /><path d="M24 74 H92" /></g>,
  violao: <g fill="none" stroke={CREAM} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"><circle cx="48" cy="76" r="16" /><circle cx="58" cy="64" r="11" /><path d="M62 60 L90 32" /><circle cx="48" cy="76" r="4" /></g>,
};

/** Desenha o avatar (`config`) no tamanho `size`. Sem config válida, desenha as iniciais (`fallback`). */
export function AvatarArt({ config, size = 48, fallback = '?', title }) {
  const a = normalizeAvatar(config);
  if (!a) {
    return (
      <span className="profile-avatar" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ width: size, height: size, background: '#0b3d2e', color: '#fff9ed', fontSize: size * 0.4 }}>
        {fallback}
      </span>
    );
  }
  if (a.kind === 'galeria') {
    return <img className="avatar-art" src={`/avatars/${a.id}.webp`} width={size} height={size} loading="lazy" decoding="async" alt={title ?? ''} aria-hidden={title ? undefined : true} style={{ objectFit: 'cover' }} />;
  }
  if (a.kind === 'mascote') return <MascotArt config={a} size={size} title={title} />;
  return (
    <svg className="avatar-art" viewBox="0 0 120 120" width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs><clipPath id={`clip-${size}`}><circle cx="60" cy="60" r="60" /></clipPath></defs>
      <g clipPath={`url(#clip-${size})`}>
        <rect width="120" height="120" fill={find(BACKGROUNDS, a.bg).hex} />
        {a.kind === 'person' ? <Person a={a} /> : <g>{ICON_ART[a.icon]}</g>}
      </g>
    </svg>
  );
}
