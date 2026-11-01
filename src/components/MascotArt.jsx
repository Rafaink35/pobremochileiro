import { useId } from 'react';
import { BACKPACK_COLORS, find, normalizeAvatar } from '../services/avatar/model.js';

// Camadas do kit "Pobre Mochileiro avatar builder" (viewBox 256×256, todas na mesma grade).
// Ordem de desenho: base-traseira → corpo (cor da mochila) → painel/bolso/braços → expressão → chapéu → acessório.
// Só IDs do catálogo escolhem camadas: nada que venha do banco vira código SVG.
const INK = '#123F32';

const BASE_BACK = <path d="M57 91 Q35 102 38 157 L43 216 Q46 235 66 235 L190 235 Q211 232 213 212 L218 145 Q220 105 196 91" fill="#7BA58A" />;
const BODY_PATH = 'M65 77 Q65 45 96 39 L161 39 Q192 45 192 78 L198 205 Q197 231 174 235 L82 235 Q58 231 58 205Z';
const BASE_FRONT = (
  <>
    <path d="M79 88 Q79 62 101 58 L157 58 Q179 62 179 88 L181 192 Q180 211 163 213 L93 213 Q76 210 77 192Z" fill="#F6F0E4" />
    <path d="M82 169 Q128 148 176 169 L176 194 Q176 208 160 209 L98 209 Q82 207 82 192Z" fill="#F4C542" />
    <path d="M48 108Q29 108 29 135L29 181Q31 197 49 194L61 190L61 113Z" fill="#7BA58A" />
    <path d="M207 108Q226 108 227 135L227 181Q225 197 207 194L195 190L195 113Z" fill="#7BA58A" />
    <path d="M91 42Q91 24 108 22L147 22Q164 24 164 42" fill="none" />
    <path d="M39 91Q20 72 31 53Q42 35 61 48L82 68" fill="#F4C542" />
  </>
);

const EXPRESSIONS = {
  smiling: (
    <>
      <ellipse cx="105" cy="119" rx="7" ry="11" fill={INK} />
      <ellipse cx="151" cy="119" rx="7" ry="11" fill={INK} />
      <path d="M101 145Q128 172 155 145" fill="none" strokeWidth="8" />
    </>
  ),
  excited: (
    <>
      <ellipse cx="105" cy="118" rx="9" ry="13" fill={INK} />
      <ellipse cx="151" cy="118" rx="9" ry="13" fill={INK} />
      <ellipse cx="128" cy="150" rx="23" ry="17" fill="#E8785D" />
    </>
  ),
  tired: (
    <>
      <path d="M94 119Q105 110 116 119M140 119Q151 110 162 119" fill="none" />
      <path d="M110 151Q128 145 146 151" fill="none" />
    </>
  ),
};

const HATS = {
  none: null,
  cap: (<><path d="M67 66Q73 23 125 22Q177 23 187 66L168 77Q126 62 82 82Z" fill="#E8785D" /><path d="M155 62Q202 53 213 75Q183 89 153 78Z" fill="#F4C542" /></>),
  beanie: (<><path d="M72 76Q76 24 128 22Q181 24 184 76L166 85Q128 72 89 85Z" fill="#6F9EAA" /><path d="M72 72Q128 89 184 72L185 91Q128 106 71 91Z" fill="#F4C542" /></>),
  bandana: (<><path d="M66 65Q128 18 190 65L179 93Q128 77 77 93Z" fill="#E8785D" /><path d="M180 79L211 112L188 115L171 91Z" fill="#E8785D" /></>),
  helmet: <path d="M67 78Q68 25 128 22Q188 25 189 78L171 91L85 91Z" fill="#F4C542" />,
  'wide-brim-hat': (<><path d="M36 72Q128 39 220 72Q217 91 128 91Q42 91 36 72Z" fill="#F4C542" /><path d="M77 69Q81 20 128 19Q176 20 180 69Z" fill="#E8785D" /></>),
};

const ACCESSORIES = {
  none: null,
  glasses: (<><circle cx="100" cy="119" r="19" fill="none" /><circle cx="156" cy="119" r="19" fill="none" /><path d="M119 119Q128 111 137 119" fill="none" /></>),
  camera: (<><rect x="93" y="169" width="70" height="52" rx="9" fill="#E8785D" /><circle cx="128" cy="195" r="15" fill="#F6F0E4" /></>),
  map: <path d="M47 147L83 135L111 148L145 135L145 207L111 220L83 207L47 219Z" fill="#F4C542" />,
  bottle: <path d="M184 151L184 137L194 128L204 137L204 151L211 215Q211 225 201 225L187 225Q177 225 178 215Z" fill="#6F9EAA" />,
  ukulele: (<><path d="M174 126L204 103L211 112L181 137Z" fill="#F4C542" /><ellipse cx="164" cy="151" rx="22" ry="28" fill="#E8785D" /></>),
};

export const MASCOT_BG = '#CFE3D6';

/** Mascote em círculo (foto de perfil). Todas as camadas dividem o mesmo viewBox, então nunca desalinham. */
export function MascotArt({ config, size = 48, title }) {
  const uid = useId().replace(/:/g, '');
  const a = normalizeAvatar({ kind: 'mascote', ...config });
  const color = find(BACKPACK_COLORS, a.backpackColor).hex;
  return (
    <svg className="avatar-art" viewBox="-10 -9 276 276" width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs><clipPath id={`mc${uid}`}><circle cx="128" cy="129" r="138" /></clipPath></defs>
      <g clipPath={`url(#mc${uid})`}>
        <rect x="-10" y="-9" width="276" height="276" fill={MASCOT_BG} />
        <g stroke={INK} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
          {BASE_BACK}
          <path d={BODY_PATH} fill={color} />
          {BASE_FRONT}
          {EXPRESSIONS[a.expression]}
          {HATS[a.hat]}
          {ACCESSORIES[a.accessory]}
        </g>
      </g>
    </svg>
  );
}
