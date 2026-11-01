import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AvatarArt } from '../../../components/AvatarArt.jsx';
import { BACKGROUNDS, BODIES, DEFAULT_PERSON, FACIAL_HAIR, GLASSES, HATS, HAIR_STYLES, ICONS, PERSON_FIELDS, PINS, SKIN_TONES, isValidAvatar, normalizeAvatar, randomAvatar } from '../model.js';

const svg = (config) => renderToStaticMarkup(createElement(AvatarArt, { config, size: 64 }));

describe('catálogo inclusivo', () => {
  it('tem 8 tons de pele e corpos magro, médio e gordo', () => {
    expect(SKIN_TONES).toHaveLength(8);
    expect(BODIES.map((b) => b.id)).toEqual(['magro', 'medio', 'gordo']);
    expect(new Set(SKIN_TONES.map((s) => s.hex)).size).toBe(8);
  });
  it('oferece cabelos variados, barba, turbante e várias bandeiras', () => {
    expect(HAIR_STYLES.map((h) => h.id)).toEqual(expect.arrayContaining(['black', 'trancas', 'cacheado', 'careca']));
    expect(FACIAL_HAIR.length).toBeGreaterThan(2);
    expect(HATS.map((h) => h.id)).toContain('turbante');
    expect(PINS.map((p) => p.id)).toEqual(expect.arrayContaining(['arcoiris', 'trans', 'bi', 'naobinaria']));
  });
  it('NÃO tem campo de identidade de gênero nem de orientação (dado sensível)', () => {
    const keys = Object.keys(PERSON_FIELDS).concat(Object.keys(DEFAULT_PERSON));
    for (const k of keys) expect(k).not.toMatch(/gener|sex|orient|identidade|trans|cis|hetero/i);
  });
});

describe('configuração segura', () => {
  it('valor desconhecido vira o padrão e chaves extras são descartadas', () => {
    const n = normalizeAvatar({ kind: 'person', skin: 'xx', body: 'gordo', evil: '<script>', hat: 'bone' });
    expect(n.skin).toBe(DEFAULT_PERSON.skin);
    expect(n.body).toBe('gordo');
    expect(n.hat).toBe('bone');
    expect('evil' in n).toBe(false);
  });
  it('entrada inválida não gera avatar', () => {
    expect(normalizeAvatar(null)).toBeNull();
    expect(normalizeAvatar('x')).toBeNull();
    expect(normalizeAvatar({ kind: 'robo' })).toBeNull();
    expect(isValidAvatar({ ...DEFAULT_PERSON })).toBe(true);
    expect(isValidAvatar({ ...DEFAULT_PERSON, skin: 'zz' })).toBe(false);
  });
  it('ícone: valida o nome e o fundo', () => {
    expect(normalizeAvatar({ kind: 'icon', icon: 'barraca', bg: 'coral' })).toEqual({ kind: 'icon', icon: 'barraca', bg: 'coral' });
    expect(normalizeAvatar({ kind: 'icon', icon: 'nada', bg: 'nada' })).toEqual({ kind: 'icon', icon: 'mochila', bg: 'verde' });
  });
  it('sorteio sempre gera uma configuração válida', () => {
    for (const r of [0, 0.3, 0.7, 0.9999]) expect(isValidAvatar(randomAvatar(() => r))).toBe(true);
  });
});

describe('desenho', () => {
  it('desenha cada tom de pele, corpo, cabelo, chapéu, óculos, barba, bandeira e ícone sem erro', () => {
    for (const s of SKIN_TONES) expect(svg({ ...DEFAULT_PERSON, skin: s.id })).toContain(s.hex);
    for (const b of BODIES) expect(svg({ ...DEFAULT_PERSON, body: b.id })).toContain('<svg');
    for (const h of HAIR_STYLES) for (const body of BODIES) expect(svg({ ...DEFAULT_PERSON, hair: h.id, body: body.id })).toContain('<svg');
    for (const h of HATS) expect(svg({ ...DEFAULT_PERSON, hat: h.id })).toContain('<svg');
    for (const g of GLASSES) expect(svg({ ...DEFAULT_PERSON, glasses: g.id })).toContain('<svg');
    for (const f of FACIAL_HAIR) expect(svg({ ...DEFAULT_PERSON, facial: f.id })).toContain('<svg');
    for (const i of ICONS) for (const bg of BACKGROUNDS) expect(svg({ kind: 'icon', icon: i.id, bg: bg.id })).toContain('<svg');
  });
  it('corpo gordo desenha o tronco mais largo que o magro', () => {
    const rx = (b) => Number(/<ellipse cx="60" cy="126" rx="(\d+)"/.exec(svg({ ...DEFAULT_PERSON, body: b }))[1]);
    expect(rx('magro')).toBeLessThan(rx('medio'));
    expect(rx('medio')).toBeLessThan(rx('gordo'));
  });
  it('bandeira aparece só quando escolhida, com as listras certas', () => {
    expect(svg({ ...DEFAULT_PERSON, pin: 'nenhum' })).not.toContain('#5bcefa');
    expect(svg({ ...DEFAULT_PERSON, pin: 'trans' })).toContain('#5bcefa');
  });
  it('sem configuração, mostra as iniciais; configuração com lixo não quebra', () => {
    expect(renderToStaticMarkup(createElement(AvatarArt, { config: null, fallback: 'AV' }))).toContain('AV');
    expect(svg({ kind: 'person', skin: '<x>', hat: {} })).toContain('<svg');
  });
});

describe('mascote-mochila (kit SVG)', () => {
  const MASCOT = { kind: 'mascote', backpackColor: 'coral', hat: 'cap', accessory: 'camera', expression: 'excited' };
  it('guarda só os 4 IDs e descarta o resto', () => {
    const n = normalizeAvatar({ ...MASCOT, svg: '<script>', backpackColor: 'rosa-choque' });
    expect(Object.keys(n).sort()).toEqual(['accessory', 'backpackColor', 'expression', 'hat', 'kind']);
    expect(n.backpackColor).toBe('forest-green');
    expect(JSON.stringify(n)).not.toMatch(/<|svg|data:/i);
  });
  it('a escolha é persistida e recuperada igual (ida e volta pelo perfil)', async () => {
    const { profilePayload, normalizeProfile } = await import('../../profile/model.js');
    const row = profilePayload({ username: 'ana_m', displayName: 'Ana', avatarConfig: MASCOT });
    expect(row.avatar_config).toEqual(MASCOT);
    expect(JSON.stringify(row.avatar_config).length).toBeLessThan(600); // limite do check do banco
    expect(normalizeProfile({ id: 'x', username: 'ana_m', avatar_config: JSON.parse(JSON.stringify(row.avatar_config)) }).avatarConfig).toEqual(MASCOT);
  });
  it('as 540 combinações são válidas e desenham todas as camadas alinhadas no mesmo viewBox', () => {
    const html = svg(MASCOT);
    expect(html).toContain('viewBox="-10 -9 276 276"');
    expect(html).toContain('clip-path'); // círculo de foto de perfil
    expect(html).toContain('#E8785D'); // cor da mochila/boné
    expect(svg({ kind: 'mascote' })).toContain('<svg');
  });
  it('config de mascote também passa por isValidAvatar', () => expect(isValidAvatar(MASCOT)).toBe(true));
});

describe('todas as combinações do kit', () => {
  it('renderizam sem erro e cada ID escolhe uma camada diferente', async () => {
    const m = await import('../model.js');
    let n = 0;
    const seen = new Set();
    for (const c of m.BACKPACK_COLORS) for (const h of m.MASCOT_HATS) for (const a of m.MASCOT_ACCESSORIES) for (const e of m.MASCOT_EXPRESSIONS) {
      const out = svg({ kind: 'mascote', backpackColor: c.id, hat: h.id, accessory: a.id, expression: e.id });
      expect(out).toContain('<svg');
      seen.add(out.replace(/mc[a-zA-Z0-9]+/g, 'mc'));
      n += 1;
    }
    expect(n).toBe(540);
    expect(seen.size).toBe(540);
  });
});
