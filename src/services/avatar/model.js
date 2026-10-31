// Avatares do perfil. O banco guarda só IDs de escolhas visuais (nunca imagem, nunca identidade de gênero ou orientação):
// assim a arte pode ser trocada por um(a) ilustrador(a) sem mexer em nenhum perfil existente.

const opt = (id, label, extra = {}) => ({ id, label, ...extra });

export const SKIN_TONES = [
  opt('s1', 'Pele muito clara', { hex: '#fbe3d0' }), opt('s2', 'Pele clara', { hex: '#f5cfa8' }),
  opt('s3', 'Pele morena clara', { hex: '#e3a977' }), opt('s4', 'Pele morena', { hex: '#c98a58' }),
  opt('s5', 'Pele parda', { hex: '#a8683c' }), opt('s6', 'Pele negra clara', { hex: '#7d4a2a' }),
  opt('s7', 'Pele negra', { hex: '#5a3420' }), opt('s8', 'Pele negra escura', { hex: '#3a2216' }),
];
export const BODIES = [opt('magro', 'Corpo magro'), opt('medio', 'Corpo médio'), opt('gordo', 'Corpo gordo')];
export const HAIR_STYLES = [
  opt('careca', 'Careca'), opt('raspado', 'Raspado'), opt('curto', 'Curto'), opt('longo', 'Longo liso'),
  opt('cacheado', 'Cacheado'), opt('black', 'Black power'), opt('coque', 'Coque'), opt('trancas', 'Tranças'),
];
export const HAIR_COLORS = [
  opt('h1', 'Preto', { hex: '#1b1410' }), opt('h2', 'Castanho escuro', { hex: '#4a2c1a' }), opt('h3', 'Castanho claro', { hex: '#8b5a2b' }),
  opt('h4', 'Loiro', { hex: '#d9b36a' }), opt('h5', 'Ruivo', { hex: '#b5471f' }), opt('h6', 'Grisalho', { hex: '#a3a3a3' }),
  opt('h7', 'Rosa', { hex: '#e46a9b' }), opt('h8', 'Azul', { hex: '#3b82c4' }),
];
export const FACIAL_HAIR = [opt('nenhuma', 'Sem barba'), opt('barba', 'Barba'), opt('bigode', 'Bigode'), opt('cavanhaque', 'Cavanhaque')];
export const HATS = [opt('nenhum', 'Sem chapéu'), opt('bone', 'Boné'), opt('aba', 'Chapéu de aba'), opt('gorro', 'Gorro'), opt('turbante', 'Turbante ou lenço'), opt('bandana', 'Bandana')];
export const GLASSES = [opt('nenhum', 'Sem óculos'), opt('redondo', 'Óculos redondo'), opt('quadrado', 'Óculos quadrado'), opt('sol', 'Óculos de sol')];
export const SHIRTS = [
  opt('verde', 'Verde', { hex: '#0b3d2e' }), opt('amarelo', 'Amarelo', { hex: '#f4c542' }), opt('coral', 'Coral', { hex: '#e8785d' }),
  opt('creme', 'Creme', { hex: '#e7dcc3' }), opt('salvia', 'Azul-sálvia', { hex: '#7aa0a8' }),
];
export const BACKGROUNDS = [
  opt('verde', 'Fundo verde', { hex: '#174d3e' }), opt('amarelo', 'Fundo amarelo', { hex: '#f7d97a' }), opt('coral', 'Fundo coral', { hex: '#f0a590' }),
  opt('creme', 'Fundo creme', { hex: '#f6f0e4' }), opt('salvia', 'Fundo sálvia', { hex: '#bcd3c7' }),
];
export const MOODS = [opt('sorrindo', 'Sorrindo'), opt('neutro', 'Sério'), opt('animado', 'Animado')];
// Bandeiras: adereço opcional que a pessoa escolhe mostrar. Não é um campo de identidade do perfil.
export const PINS = [
  opt('nenhum', 'Sem bandeira'),
  opt('arcoiris', 'Arco-íris (LGBTQIA+)', { stripes: ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787'] }),
  opt('trans', 'Bandeira trans', { stripes: ['#5bcefa', '#f5a9b8', '#ffffff', '#f5a9b8', '#5bcefa'] }),
  opt('bi', 'Bandeira bi', { stripes: ['#d60270', '#d60270', '#9b4f96', '#0038a8', '#0038a8'] }),
  opt('naobinaria', 'Bandeira não-binária', { stripes: ['#fcf434', '#ffffff', '#9c59d1', '#2c2c2c'] }),
  opt('lesbica', 'Bandeira lésbica', { stripes: ['#d52d00', '#ff9a56', '#ffffff', '#d162a4', '#a30262'] }),
  opt('pan', 'Bandeira pan', { stripes: ['#ff218c', '#ffd800', '#21b1ff'] }),
];
export const ICONS = [
  opt('mochila', 'Mochila'), opt('barraca', 'Barraca'), opt('bussola', 'Bússola'), opt('sol', 'Sol'), opt('montanha', 'Montanha'), opt('onda', 'Onda'),
  opt('onibus', 'Ônibus'), opt('aviao', 'Avião'), opt('fogueira', 'Fogueira'), opt('mapa', 'Mapa'), opt('tenis', 'Tênis de trilha'), opt('violao', 'Violão'),
];

export const PERSON_FIELDS = {
  skin: SKIN_TONES, body: BODIES, hair: HAIR_STYLES, hairColor: HAIR_COLORS, facial: FACIAL_HAIR, hat: HATS,
  glasses: GLASSES, shirt: SHIRTS, pin: PINS, mood: MOODS, bg: BACKGROUNDS,
};

export const DEFAULT_PERSON = { kind: 'person', skin: 's4', body: 'medio', hair: 'curto', hairColor: 'h2', facial: 'nenhuma', hat: 'nenhum', glasses: 'nenhum', shirt: 'verde', pin: 'nenhum', mood: 'sorrindo', bg: 'amarelo' };
export const DEFAULT_ICON = { kind: 'icon', icon: 'mochila', bg: 'verde' };

const ids = (list) => list.map((o) => o.id);

/** Config segura: qualquer valor fora do catálogo vira o padrão; chaves desconhecidas são descartadas. */
export function normalizeAvatar(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'icon') {
    return { kind: 'icon', icon: ids(ICONS).includes(raw.icon) ? raw.icon : DEFAULT_ICON.icon, bg: ids(BACKGROUNDS).includes(raw.bg) ? raw.bg : DEFAULT_ICON.bg };
  }
  if (raw.kind === 'person') {
    const out = { kind: 'person' };
    for (const [field, list] of Object.entries(PERSON_FIELDS)) out[field] = ids(list).includes(raw[field]) ? raw[field] : DEFAULT_PERSON[field];
    return out;
  }
  return null;
}

export const isValidAvatar = (raw) => {
  const n = normalizeAvatar(raw);
  return Boolean(n) && JSON.stringify(n) === JSON.stringify(Object.fromEntries(Object.keys(n).map((k) => [k, raw[k]])));
};

export function randomAvatar(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)].id;
  const out = { kind: 'person' };
  for (const [field, list] of Object.entries(PERSON_FIELDS)) out[field] = pick(list);
  return out;
}

export const find = (list, id) => list.find((o) => o.id === id) ?? list[0];
