// E0: TESTES DE CARACTERIZAÇÃO do agrupamento legado do Stay Finder (`groupDuplicates`).
// [CARACTERIZAÇÃO: comportamento atual, NÃO é requisito definitivo.] Cada teste fixa o que o código FAZ HOJE, inclusive quando é
// indesejado ou ambíguo. Se algum falhar depois de uma mudança, a mudança alterou o comportamento legado e precisa de aprovação
// explícita; não ajuste a expectativa sem essa decisão. Dados SIMULADOS e fictícios.
import { describe, expect, it } from 'vitest';
import { groupDuplicates } from '../dedupe.js';

const ms = (m) => m / 111320; // graus de latitude por metro
let seq = 0;
const rec = (id, o = {}) => {
  seq += 1;
  return {
    id, provider: 'osm', sourceId: id, name: `Nome ${id} ${seq}`, category: 'hotel', lat: 38.7, lon: -9.1, city: null, website: null, phone: null,
    prices: [], sources: [{ provider: o.provider ?? 'osm', originalId: o.sourceId ?? id }], ...o,
  };
};
const parts = (groups) => groups.map((g) => [...g.memberIds].sort().join('+')).sort();
const at = (m) => ({ lat: 38.7 + ms(m) });

describe('CARACTERIZAÇÃO L-KEY: a regra de chave (mesmo provider + sourceId), isolada', () => {
  it('une dois registros só pela chave: nomes, categorias e sites diferentes, a 100 m', () => {
    const out = groupDuplicates([rec('a', { sourceId: 'K', name: 'Alfa' }), rec('b', { sourceId: 'K', name: 'Beta', category: 'hostel', ...at(100) })]);
    expect(out).toHaveLength(1);
    expect(out[0].groupSize).toBe(2);
    expect(out[0].groupReasons).toEqual(['mesmo registro da fonte']);
  });

  it('controle: a MESMA entrada com chaves diferentes não agrupa (a chave é a única ligação)', () => {
    const out = groupDuplicates([rec('a', { sourceId: 'K1', name: 'Alfa' }), rec('b', { sourceId: 'K2', name: 'Beta', category: 'hostel', ...at(100) })]);
    expect(out).toHaveLength(2);
  });

  it('a chave ignora a categoria; as demais regras exigem categoria compatível', () => {
    const base = { website: 'https://mesmo-site.test' };
    expect(groupDuplicates([rec('a', { sourceId: 'K', ...base }), rec('b', { sourceId: 'K', ...base, category: 'hostel', ...at(50) })])).toHaveLength(1);
    expect(groupDuplicates([rec('a', { sourceId: 'K1', ...base }), rec('b', { sourceId: 'K2', ...base, category: 'hostel', ...at(50) })])).toHaveLength(2);
  });

  it('só atua em pares candidatos: a 400 m não agrupa, a 299 m agrupa', () => {
    expect(groupDuplicates([rec('a', { sourceId: 'K' }), rec('b', { sourceId: 'K', ...at(400) })])).toHaveLength(2);
    expect(groupDuplicates([rec('a', { sourceId: 'K' }), rec('b', { sourceId: 'K', ...at(299) })])).toHaveLength(1);
  });

  it('sem coordenadas: só entra no par se o município for igual; sem município nos dois, nunca é comparado', () => {
    const nc = (id, city, o = {}) => rec(id, { sourceId: 'K', lat: null, lon: null, city, ...o });
    expect(groupDuplicates([nc('a', 'Lisboa'), nc('b', 'LISBOA')])).toHaveLength(1);
    expect(groupDuplicates([nc('a', 'Lisboa'), nc('b', 'Porto')])).toHaveLength(2);
    expect(groupDuplicates([nc('a', null), nc('b', null)])).toHaveLength(2);
  });

  it('um registro sem coordenadas e outro com coordenadas: une pela chave se o município for igual', () => {
    const out = groupDuplicates([rec('a', { sourceId: 'K', lat: null, lon: null, city: 'Lisboa' }), rec('b', { sourceId: 'K', city: 'lisboa' })]);
    expect(out).toHaveLength(1);
    expect(out[0].groupReasons).toEqual(['mesmo registro da fonte']);
  });

  it('chave igual em provedores diferentes não une (a regra compara provider e sourceId)', () => {
    expect(groupDuplicates([rec('a', { sourceId: 'K' }), rec('b', { provider: 'wikivoyage', sourceId: 'K', ...at(10) })])).toHaveLength(2);
  });
});

describe('CARACTERIZAÇÃO: o motivo registrado é só o PRIMEIRO que casa (a chave mascara as outras regras)', () => {
  const base = { website: 'https://z-site.test', phone: '211234567', name: 'Hotel Z' };
  const pair = (m1, m2) => groupDuplicates([rec('b1', { sourceId: 'K', ...base, ...m1 }), rec('b2', { sourceId: 'K', ...base, ...at(50), ...m2 })]);

  it('chave, nome, site e telefone casam juntos: o único motivo é "mesmo registro da fonte"', () => {
    expect(pair({}, {})[0].groupReasons).toEqual(['mesmo registro da fonte']);
  });
  it('removendo a chave, o próximo motivo aparece; e assim sucessivamente', () => {
    expect(pair({ sourceId: 'K1' }, { sourceId: 'K2' })[0].groupReasons[0]).toMatch(/^mesmo nome a \d+ m$/);
    expect(pair({ sourceId: 'K1', name: 'U' }, { sourceId: 'K2', name: 'V' })[0].groupReasons).toEqual(['mesmo site (z-site.test)']);
    expect(pair({ sourceId: 'K1', name: 'U', website: null }, { sourceId: 'K2', name: 'V', website: null })[0].groupReasons).toEqual(['mesmo telefone']);
    expect(pair({ sourceId: 'K1', name: 'U', website: null, phone: null }, { sourceId: 'K2', name: 'V', website: null, phone: null })).toHaveLength(2);
  });
});

describe('CARACTERIZAÇÃO: regras de nome, município sem coordenadas, site e telefone (limites)', () => {
  it('nome idêntico: 149 m agrupa e 160 m não', () => {
    expect(groupDuplicates([rec('a', { name: 'Casa' }), rec('b', { name: 'CASA', ...at(149) })])).toHaveLength(1);
    expect(groupDuplicates([rec('a', { name: 'Casa' }), rec('b', { name: 'CASA', ...at(160) })])).toHaveLength(2);
  });
  it('telefone igual: 299 m agrupa e 301 m não; os 9 últimos dígitos ignoram o prefixo do país', () => {
    expect(groupDuplicates([rec('a', { phone: '+351 211 234 567' }), rec('b', { phone: '211234567', ...at(299) })])).toHaveLength(1);
    expect(groupDuplicates([rec('a', { phone: '+351 211 234 567' }), rec('b', { phone: '211234567', ...at(301) })])).toHaveLength(2);
  });
  it('site e telefone exigem categoria compatível', () => {
    expect(groupDuplicates([rec('a', { website: 'https://s.test' }), rec('b', { website: 'https://s.test', category: 'hostel', ...at(100) })])).toHaveLength(2);
    expect(groupDuplicates([rec('a', { phone: '211234567' }), rec('b', { phone: '211234567', category: 'hostel', ...at(100) })])).toHaveLength(2);
  });
  it('sem coordenadas: mesmo nome, categoria e município agrupa; categoria diferente ou sem município nos dois, não', () => {
    const nc = (id, o = {}) => rec(id, { name: 'Pousada Sol', category: 'pousada', lat: null, lon: null, city: 'Lisboa', ...o });
    expect(groupDuplicates([nc('a'), nc('b', { city: 'lisboa' })])).toHaveLength(1);
    expect(groupDuplicates([nc('a'), nc('b', { category: 'hotel' })])).toHaveLength(2);
    expect(groupDuplicates([nc('a', { city: null }), nc('b', { city: null })])).toHaveLength(2);
  });
  it('um sem coordenadas e outro com: site e telefone iguais NÃO são avaliados (só chave e nome+município)', () => {
    const cad = rec('c', { lat: null, lon: null, city: 'Lisboa', website: 'https://s.test', phone: '211234567', name: 'Outro' });
    const osm = rec('o', { city: 'Lisboa', website: 'https://s.test', phone: '211234567', name: 'Um nome' });
    expect(groupDuplicates([cad, osm])).toHaveLength(2);
  });
  it('um nome só de pontuação conta como nome no filtro de exibição, mas não casa pela regra de nome', () => {
    expect(groupDuplicates([rec('a', { name: '---' }), rec('b', { name: '---', ...at(10) })])).toHaveLength(2);
  });
});

describe('CARACTERIZAÇÃO: grade geográfica (células de 0,003° iguais em latitude e longitude)', () => {
  const dlon = 250 / (111320 * Math.cos((60 * Math.PI) / 180)); // 250 m leste-oeste a 60° de latitude
  const pair = (lon1, extra) => [rec('g1', { lat: 60, lon: lon1, ...extra }), rec('g2', { lat: 60, lon: lon1 + dlon, ...extra })];

  it('a 60° de latitude, um par a 250 m com a mesma chave em células NÃO vizinhas não é avaliado', () => {
    expect(groupDuplicates(pair(0.0029, { sourceId: 'K' }).map((r) => ({ ...r })))).toHaveLength(2);
  });
  it('controle: o mesmo par, deslocado para células vizinhas, agrupa pela chave', () => {
    expect(groupDuplicates(pair(0.0001, { sourceId: 'K' }))).toHaveLength(1);
  });
  it('a limitação vale para todas as regras: mesmo site, células não vizinhas, não agrupa', () => {
    expect(groupDuplicates(pair(0.0029, { website: 'https://s.test' }))).toHaveLength(2);
    expect(groupDuplicates(pair(0.0001, { website: 'https://s.test' }))).toHaveLength(1);
  });
});

describe('CARACTERIZAÇÃO: transitividade (união sem veto, diâmetro nem tamanho máximo)', () => {
  it('cinco registros de mesmo nome a passos de 120 m viram UM grupo (extensão ~480 m)', () => {
    const out = groupDuplicates(Array.from({ length: 5 }, (_, i) => rec(`c${i}`, { name: 'Mesmo', ...at(120 * i) })));
    expect(out).toHaveLength(1);
    expect(out[0].groupSize).toBe(5);
  });
  it('A–B por nome e B–C por site, sem regra entre A e C: um grupo', () => {
    const a = rec('a', { name: 'Igual', ...at(0) });
    const b = rec('b', { name: 'Igual', website: 'https://bc.test', ...at(100) });
    const c = rec('c', { name: 'Diferente', website: 'https://bc.test', ...at(250) });
    expect(groupDuplicates([a, b, c])).toHaveLength(1);
  });
  it('a partição não depende da ordem de entrada nos cenários testados', () => {
    const set = [rec('s1', { sourceId: 'K', website: 'https://t.test' }), rec('s2', { sourceId: 'K', ...at(50) }), rec('s3', { website: 'https://t.test', provider: 'wikivoyage', ...at(120) }), rec('s4', { ...at(2000) })];
    const expected = parts(groupDuplicates(set));
    expect(parts(groupDuplicates([...set].reverse()))).toEqual(expected);
    expect(parts(groupDuplicates([set[2], set[0], set[3], set[1]]))).toEqual(expected);
  });
});

describe('CARACTERIZAÇÃO: contrafactual de remover só a chave (por mutação do sourceId), principal e componentes', () => {
  const mk = (id, o) => rec(id, { name: `N-${id}`, ...o });
  const unkey = (recs, ids) => recs.map((r) => (ids.includes(r.id) ? { ...r, sourceId: `solo-${r.id}`, sources: [{ provider: r.provider, originalId: `solo-${r.id}` }] } : r));
  const view = (gs) => gs.map((g) => ({ primary: g.id, members: [...g.memberIds].sort() })).sort((x, y) => x.primary.localeCompare(y.primary));

  it('Ex1: A–B chave, B–C site (principal B) → A sai; B e C continuam por site', () => {
    const r = [mk('A', { sourceId: 'KAB' }), mk('B', { sourceId: 'KAB', website: 'https://bc.test', phone: '211000001', ...at(60) }), mk('C', { provider: 'wikivoyage', website: 'https://bc.test', ...at(120) })];
    expect(view(groupDuplicates(r))).toEqual([{ primary: 'B', members: ['A', 'B', 'C'] }]);
    expect(view(groupDuplicates(unkey(r, ['A'])))).toEqual([{ primary: 'A', members: ['A'] }, { primary: 'B', members: ['B', 'C'] }]);
  });
  it("Ex1': com A principal, a nova componente {B,C} passa a ter B como principal; A continua principal", () => {
    const r = [mk('A', { sourceId: 'KAB', website: 'https://a.test', phone: '211000002', city: 'L' }), mk('B', { sourceId: 'KAB', website: 'https://bc.test', ...at(60) }), mk('C', { provider: 'wikivoyage', website: 'https://bc.test', ...at(120) })];
    expect(view(groupDuplicates(r))[0].primary).toBe('A');
    expect(view(groupDuplicates(unkey(r, ['A'])))).toEqual([{ primary: 'A', members: ['A'] }, { primary: 'B', members: ['B', 'C'] }]);
  });
  it('Ex2: A–B chave e site (conexão por chave redundante) → nada muda', () => {
    const r = [mk('A', { sourceId: 'KAB', website: 'https://abc.test' }), mk('B', { sourceId: 'KAB', website: 'https://abc.test', ...at(60) }), mk('C', { provider: 'wikivoyage', website: 'https://abc.test', ...at(120) })];
    expect(parts(groupDuplicates(unkey(r, ['A'])))).toEqual(parts(groupDuplicates(r)));
  });
  it('Ex3: A–B chave, A–C nome, B–C site → A e B continuam unidos por caminho alternativo', () => {
    const r = [mk('A', { sourceId: 'KAB', name: 'Mesmo Nome', website: 'https://a.test' }), mk('B', { sourceId: 'KAB', website: 'https://bc.test', ...at(100) }), mk('C', { provider: 'wikivoyage', name: 'Mesmo Nome', website: 'https://bc.test', ...at(50) })];
    expect(groupDuplicates(r)).toHaveLength(1);
    expect(groupDuplicates(unkey(r, ['B']))).toHaveLength(1);
  });
  it('Ex4: A–B só por chave → dissolve em dois itens', () => {
    const r = [mk('A', { sourceId: 'KAB' }), mk('B', { sourceId: 'KAB', ...at(60) })];
    expect(groupDuplicates(r)).toHaveLength(1);
    expect(groupDuplicates(unkey(r, ['B']))).toHaveLength(2);
  });
  it('Ex5: A–B chave, B–C site, C–D nome → A sai; {B,C,D} continuam; apenas um novo principal', () => {
    const r = [mk('A', { sourceId: 'KAB', website: 'https://a.test', phone: '211000003', city: 'L' }), mk('B', { sourceId: 'KAB', website: 'https://bc.test', ...at(60) }),
      mk('C', { provider: 'wikivoyage', website: 'https://bc.test', name: 'Nome CD', ...at(120) }), mk('D', { provider: 'community', name: 'Nome CD', ...at(180) })];
    expect(view(groupDuplicates(r))).toEqual([{ primary: 'A', members: ['A', 'B', 'C', 'D'] }]);
    expect(view(groupDuplicates(unkey(r, ['A'])))).toEqual([{ primary: 'A', members: ['A'] }, { primary: 'B', members: ['B', 'C', 'D'] }]);
  });
  it('o principal de um grupo continua principal em qualquer subconjunto que o contenha (propriedade do critério de escolha)', () => {
    const r = [mk('A', { sourceId: 'KAB', website: 'https://a.test', phone: '211000004', city: 'L' }), mk('B', { sourceId: 'KAB', website: 'https://bc.test', ...at(60) }), mk('C', { provider: 'wikivoyage', website: 'https://bc.test', ...at(120) })];
    expect(groupDuplicates(r)[0].id).toBe('A');
    expect(groupDuplicates(unkey(r, ['B'])).find((g) => g.memberIds.includes('A')).id).toBe('A');
  });
});

describe('CARACTERIZAÇÃO: critério de escolha do principal e identidade de registro', () => {
  it('categoria classificada vence não classificada; com nome vence sem nome; depois prioridade de fonte (osm antes de wikivoyage)', () => {
    const site = { website: 'https://q.test' };
    const wiki = rec('w', { provider: 'wikivoyage', name: 'W', category: 'nao_classificada', ...site, ...at(10) });
    const osm = rec('o', { name: 'O', category: 'hotel', ...site });
    expect(groupDuplicates([wiki, osm])[0].id).toBe('o');
    const unnamedOsm = rec('u', { name: null, ...site });
    const namedWiki = rec('w2', { provider: 'wikivoyage', name: 'W2', ...site, ...at(10) });
    expect(groupDuplicates([unnamedOsm, namedWiki])[0].id).toBe('w2');
    const wiki2 = rec('w3', { provider: 'wikivoyage', name: 'W3', ...site, ...at(10) });
    const osm2 = rec('o3', { name: 'O3', ...site, ...at(250) });
    expect(groupDuplicates([wiki2, osm2])[0].id).toBe('o3');
  });
  it('só o principal fornece os campos do item (coordenadas, site, telefone); os demais ficam só em sources e memberIds', () => {
    const osm = rec('o', { website: null, phone: null, name: 'Mesmo', ...at(0) });
    const wiki = rec('w', { provider: 'wikivoyage', website: 'https://w.test', phone: '+351 211 234 567', name: 'Mesmo', ...at(100) });
    const [g] = groupDuplicates([osm, wiki]);
    expect(g.id).toBe('o');
    expect(g.website).toBeNull();
    expect(g.phone).toBeNull();
    expect(g.lat).toBe(38.7);
  });
  it('ids repetidos entre membros: groupSize conta os dois, memberIds colapsa em um, e o principal depende da ordem de entrada', () => {
    const a = rec('same', { sourceId: 'K', website: 'https://w1.test' });
    const b = rec('same', { sourceId: 'K', website: 'https://w2.test', ...at(10) });
    const ab = groupDuplicates([a, b]);
    const ba = groupDuplicates([b, a]);
    expect(ab[0].groupSize).toBe(2);
    expect(ab[0].memberIds).toHaveLength(1);
    expect(ab[0].website).toBe('https://w1.test');
    expect(ba[0].website).toBe('https://w2.test');
  });
  it('registros com a mesma chave e ids diferentes: memberIds lista todos', () => {
    const [g] = groupDuplicates([rec('x1', { sourceId: 'K' }), rec('x2', { sourceId: 'K', ...at(10) })]);
    expect([...g.memberIds].sort()).toEqual(['x1', 'x2']);
  });
});

describe('CARACTERIZAÇÃO: possível duplicata não une nem esconde', () => {
  it('nome parecido (Dice ≥ 0,6) a até 250 m, mesma categoria, sem outra regra: dois itens, cada um aponta o outro', () => {
    const out = groupDuplicates([rec('a', { name: 'Casa do Mar Verde' }), rec('b', { name: 'Mar Verde Casa', ...at(100) })]);
    expect(out).toHaveLength(2);
    expect(out.every((g) => g.possibleDuplicates.length === 1)).toBe(true);
  });
});
