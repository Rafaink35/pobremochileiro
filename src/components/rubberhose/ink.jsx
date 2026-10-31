// Primitivas de desenho do estilo "rubber hose": contorno preto grosso, membros de mangueira, mãos de desenho animado.
export const INK = '#14100d';

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
/** Escurece (amt < 0) ou clareia (amt > 0) uma cor #rrggbb. */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => clamp(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Membro de mangueira: uma linha grossa colorida por cima de uma linha preta mais grossa. */
export function Hose({ d, w, color, outline = 5 }) {
  return (
    <g>
      <path d={d} fill="none" stroke={INK} strokeWidth={w + outline * 2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export const Ink = ({ d, fill, sw = 6, ...rest }) => <path d={d} fill={fill} stroke={INK} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" {...rest} />;

/** Mão estilizada. `kind`: open (acenando), fist (punho), thumb (joinha). `flip` espelha. */
export function Hand({ x, y, skin, kind = 'open', angle = 0, flip = false, s = 1 }) {
  const dark = shade(skin, -0.22);
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${flip ? -s : s} ${s})`}>
      {kind === 'open' && (
        <>
          {[-34, 0, 34].map((a) => (
            <g key={a} transform={`rotate(${a}) translate(0 -22)`}>
              <ellipse rx="7.5" ry="13" fill={skin} stroke={INK} strokeWidth="5" />
            </g>
          ))}
          <circle r="17" fill={skin} stroke={INK} strokeWidth="5.5" />
          <g transform="rotate(-70) translate(0 -17)"><ellipse rx="7.5" ry="12" fill={skin} stroke={INK} strokeWidth="5" /></g>
          <circle r="17" fill={skin} />
          <path d="M-8 6 Q0 12 8 6" stroke={dark} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      )}
      {kind === 'fist' && (
        <>
          <circle r="18" fill={skin} stroke={INK} strokeWidth="5.5" />
          {[-9, 0, 9].map((dx) => <path key={dx} d={`M${dx} -16 V-4`} stroke={dark} strokeWidth="3" strokeLinecap="round" />)}
          <g transform="rotate(35) translate(-2 12)"><ellipse rx="7" ry="10" fill={skin} stroke={INK} strokeWidth="4.5" /></g>
        </>
      )}
      {kind === 'thumb' && (
        <>
          <g transform="translate(-3 -24)"><ellipse rx="8" ry="15" fill={skin} stroke={INK} strokeWidth="5" /></g>
          <circle r="18" fill={skin} stroke={INK} strokeWidth="5.5" />
          {[-8, 2, 12].map((dx) => <path key={dx} d={`M${dx} 0 V10`} stroke={dark} strokeWidth="3" strokeLinecap="round" />)}
          <circle r="16" fill={skin} />
          {[-8, 2, 12].map((dx) => <path key={dx} d={`M${dx} 2 V11`} stroke={dark} strokeWidth="3" strokeLinecap="round" />)}
        </>
      )}
    </g>
  );
}
