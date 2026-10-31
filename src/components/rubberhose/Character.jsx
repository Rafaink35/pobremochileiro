import { useId } from 'react';
import { INK, Hose, Ink, Hand, shade } from './ink.jsx';
import { BODIES, CX, HEAD, torsoPath } from './geometry.js';
import { HairBack, HairFront, Headgear, Glasses, Face, Shoe, PackBack, PackStraps, Outfit } from './parts.jsx';

const ARM_POSES = {
  // [cotovelo dx, dy, mão dx, dy] relativo ao ombro; lado esquerdo do personagem (x negativo)
  wave: { c: [-48, -10], h: [-70, -78], hand: 'open', angle: -15 },
  hip: { c: [-62, 30], h: [-30, 78], hand: 'fist', angle: 0 },
  thumb: { c: [-58, 14], h: [-66, -46], hand: 'thumb', angle: 0 },
  down: { c: [-30, 50], h: [-40, 110], hand: 'open', angle: 180 },
};

function Arm({ side, b, skin, sleeve, pose }) {
  const p = ARM_POSES[pose] ?? ARM_POSES.down;
  const k = side === 'l' ? 1 : -1;
  const sx = CX - k * b.shoulderDx;
  const sy = b.shoulderY;
  const ex = sx + k * p.c[0];
  const ey = sy + p.c[1];
  const hx = sx + k * p.h[0];
  const hy = sy + p.h[1];
  const d = `M${sx} ${sy} Q${ex} ${ey} ${hx} ${hy}`;
  // manga cobre o início do braço (mesma curva, menor)
  const ex2 = (sx + ex) / 2;
  const ey2 = (sy + ey) / 2;
  const mx = 0.25 * sx + 0.5 * ex + 0.25 * hx;
  const my = 0.25 * sy + 0.5 * ey + 0.25 * hy;
  const dSleeve = `M${sx} ${sy} Q${ex2} ${ey2} ${mx} ${my}`;
  return (
    <g>
      <Hose d={d} w={b.armW} color={skin} outline={5.5} />
      {sleeve && <Hose d={dSleeve} w={b.armW + 3} color={sleeve} outline={5.5} />}
      <Hand x={hx} y={hy} skin={skin} kind={p.hand} angle={p.angle * (k === 1 ? 1 : -1)} flip={k === -1} s={b.armW > 17 ? 1.4 : 1.3} />
    </g>
  );
}

export function Character({ cfg, bust = false, title }) {
  const uid = useId().replace(/:/g, '');
  const b = BODIES[cfg.body] ?? BODIES.medio;
  const head = { cx: HEAD.cx, cy: HEAD.cy, rx: b.headRx, ry: b.headRy };
  const skin = cfg.skin;
  const outfit = cfg.outfit ?? {};
  const pants = cfg.pants ?? { color: '#2c5f8a' };
  const hipY = b.hipY;
  const footY = 482;
  const legL = `M${CX - b.hipDx} ${hipY} Q${CX - b.hipDx - 8} ${hipY + 60} ${CX - b.footDx} ${footY - 14}`;
  const legR = `M${CX + b.hipDx} ${hipY} Q${CX + b.hipDx + 8} ${hipY + 60} ${CX + b.footDx} ${footY - 14}`;
  const shortsEnd = 0.38;
  const shortL = `M${CX - b.hipDx} ${hipY} Q${CX - b.hipDx - 3} ${hipY + 24} ${CX - b.hipDx - 6} ${hipY + 40}`;
  const shortR = `M${CX + b.hipDx} ${hipY} Q${CX + b.hipDx + 3} ${hipY + 24} ${CX + b.hipDx + 6} ${hipY + 40}`;
  const longPants = cfg.pants?.long !== false;
  const viewBox = bust ? '90 20 220 230' : '0 -50 400 600';
  const pantsL = longPants ? legL : shortL;
  const pantsR = longPants ? legR : shortR;

  return (
    <svg viewBox={viewBox} style={{ overflow: "visible" }} role="img" aria-label={title ?? 'Personagem'} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id={`f${uid}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="5" result="d" />
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="9" result="g" />
          <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.07  0 0 0 0 0.05  2.4 0 0 0 -1.5" result="ga" />
          <feComposite in="ga" in2="d" operator="in" result="gc" />
          <feMerge><feMergeNode in="d" /><feMergeNode in="gc" /></feMerge>
        </filter>
        <clipPath id={`t${uid}`}><path d={torsoPath(b)} /></clipPath>
      </defs>
      <g filter={`url(#f${uid})`}>
        {!bust && <ellipse cx={CX} cy="506" rx={b.footDx + 70} ry="14" fill="#00000030" />}
        <HairBack style={cfg.hair?.style} color={cfg.hair?.color} head={head} />
        {!bust && cfg.backpack && <PackBack type={cfg.backpack.type} color={cfg.backpack.color} color2={cfg.backpack.color2} b={b} />}
        {!bust && (
          <>
            <Hose d={legL} w={b.legW} color={skin} outline={5.5} />
            <Hose d={legR} w={b.legW} color={skin} outline={5.5} />
            <Hose d={pantsL} w={b.legW + 4} color={pants.color} outline={5.5} />
            <Hose d={pantsR} w={b.legW + 4} color={pants.color} outline={5.5} />
            <Shoe x={CX - b.footDx - 6} y={footY} color={cfg.shoes ?? '#d94a3d'} flip />
            <Shoe x={CX + b.footDx + 6} y={footY} color={cfg.shoes ?? '#d94a3d'} />
          </>
        )}
        <Ink d={torsoPath(b)} fill={outfit.color ?? '#F4C542'} sw={6.5} />
        <Outfit type={outfit.type} color={outfit.color ?? '#F4C542'} color2={outfit.color2 ?? '#0B3D2E'} b={b} clipId={`t${uid}`} />
        <path d={torsoPath(b)} fill="none" stroke={INK} strokeWidth="6.5" strokeLinejoin="round" />
        {/* pescoço */}
        <rect x={CX - 12} y={head.cy + head.ry - 14} width="24" height="30" fill={skin} stroke={INK} strokeWidth="5" />
        {!bust && cfg.backpack && <PackStraps color={cfg.backpack.strap ?? cfg.backpack.color2} b={b} />}
        {!bust && <Arm side="l" b={b} skin={skin} sleeve={outfit.sleeve} pose={cfg.pose?.l ?? 'down'} />}
        {!bust && <Arm side="r" b={b} skin={skin} sleeve={outfit.sleeve} pose={cfg.pose?.r ?? 'down'} />}
        {/* cabeça */}
        <ellipse cx={head.cx - head.rx + 2} cy={head.cy + 8} rx="11" ry="15" fill={skin} stroke={INK} strokeWidth="5.5" />
        <ellipse cx={head.cx + head.rx - 2} cy={head.cy + 8} rx="11" ry="15" fill={skin} stroke={INK} strokeWidth="5.5" />
        <ellipse cx={head.cx} cy={head.cy} rx={head.rx} ry={head.ry} fill={skin} stroke={INK} strokeWidth="6.5" />
        <path d={`M${head.cx - head.rx * 0.62} ${head.cy - head.ry * 0.5} q-8 22 -2 48`} stroke="#ffffff55" strokeWidth="6" fill="none" strokeLinecap="round" />
        <HairFront style={cfg.hair?.style} color={cfg.hair?.color} head={head} />
        <Face head={head} skin={skin} eyes={cfg.eyes} mouth={cfg.mouth} brows={cfg.brows} look={cfg.look ?? 0} />
        <Glasses type={cfg.glasses?.type} color={cfg.glasses?.color ?? '#14100d'} head={head} />
        <Headgear type={cfg.headgear?.type} color={cfg.headgear?.color} color2={cfg.headgear?.color2} head={head} />
      </g>
    </svg>
  );
}

export function Stage({ bg, children }) {
  const uid = useId().replace(/:/g, '');
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a1 = (i / 16) * Math.PI * 2;
    const a2 = ((i + 0.5) / 16) * Math.PI * 2;
    const r = 700;
    return <path key={i} d={`M300 300 L${300 + Math.cos(a1) * r} ${300 + Math.sin(a1) * r} L${300 + Math.cos(a2) * r} ${300 + Math.sin(a2) * r} Z`} fill={bg.ray} />;
  });
  return (
    <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', border: '6px solid #14100d', background: bg.base, aspectRatio: '5 / 6', boxShadow: '6px 6px 0 #14100d' }}>
      <svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
        <defs>
          <radialGradient id={`v${uid}`}><stop offset="45%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity=".45" /></radialGradient>
          <filter id={`p${uid}`}><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3" seed="2" /><feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 0 0.05  0 0 0 0.35 0" /></filter>
        </defs>
        {rays}
        {bg.shapes}
        <rect width="600" height="600" fill={`url(#v${uid})`} />
        <rect width="600" height="600" filter={`url(#p${uid})`} opacity=".3" />
      </svg>
      <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}
