// E0: TESTES DE CARACTERIZAÇÃO de preços do grupo, ranking e registros sem nome no pipeline legado do Stay Finder.
// [CARACTERIZAÇÃO: comportamento atual, NÃO é requisito definitivo.] Documenta o que o código faz hoje, inclusive o indesejado.
// Dados SIMULADOS e fictícios. Não corrigir o comportamento aqui: mudar uma expectativa exige decisão de produto.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { groupDuplicates } from '../dedupe.js';
import { assembleResults } from '../search.js';
import { hasName } from '../display.js';
import { rankStays } from '../rank.js';
import { bestPrice } from '../price.js';

const NOW = new Date('2026-11-06T12:00:00Z');
const C = { lat: 38.7, lon: -9.1 };
const ms = (m) => m / 111320;
const at = (m) => ({ lat: C.lat + ms(m) });
const price = (amount, day = '20', o = {}) => ({ status: 'published', amount, currency: 'EUR', unit: { basis: 'person', period: 'night' }, observedAt: `2026-10-${day}T00:00:00.000Z`, source: { name: 'Fonte' }, ...o });
const rec = (id, o = {}) => ({
  id, provider: 'osm', sourceId: id, name: `Nome ${id}`, category: 'hotel', lat: C.lat, lon: C.lon, city: null, website: null, phone: null,
  prices: [], sources: [{ provider: o.provider ?? 'osm', originalId: o.sourceId ?? id }], ...o,
});
const assemble = (records, extra = {}) => assembleResults({ records, categories: ['hotel'], center: C, limit: 100, now: NOW, ...extra });
const unnamed = (id, o = {}) => rec(id, { name: null, ...o });

describe('CARACTERIZAÇÃO: preços do grupo (agregação, melhor preço, ofertas repetidas)', () => {
  it('os preços de todos os membros são concatenados, sem deduplicar ofertas: duas cópias com o mesmo preço viram dois preços', () => {
    const [g] = groupDuplicates([rec('o1', { sourceId: 'K', prices: [price(20)] }), rec('o2', { sourceId: 'K', ...at(10), prices: [price(20)] })]);
    expect(g.groupSize).toBe(2);
    expect(g.prices).toHaveLength(2);
    expect(rankStays([g], NOW).ranked[0].pricing.amount).toBe(20);
  });

  it('o melhor preço NÃO é o menor valor: na mesma classe e data, vale a posição de entrada', () => {
    expect([bestPrice([price(90), price(10)], NOW).amount, bestPrice([price(10), price(90)], NOW).amount]).toEqual([90, 10]);
  });
  it('o melhor preço: o mais recente vence, mesmo mais caro', () => {
    expect(bestPrice([price(10, '01'), price(90, '25')], NOW).amount).toBe(90);
  });
  it('o melhor preço: confirmado vigente vence publicado, mesmo mais caro; confirmado vencido perde', () => {
    expect(bestPrice([price(10, '25'), price(90, '25', { status: 'confirmed' })], NOW)).toMatchObject({ class: 'confirmed', amount: 90 });
    expect(bestPrice([price(10, '25'), price(90, '01', { status: 'confirmed' })], NOW)).toMatchObject({ class: 'published', amount: 10 });
  });

  it('dois estabelecimentos distintos unidos só pela chave viram um item com os preços dos dois; o preço exibido é o do primeiro, não o menor', () => {
    const r = assemble([rec('x1', { name: 'Hotel X1', sourceId: 'K', prices: [price(90)] }), rec('x2', { name: 'Hotel X2', sourceId: 'K', ...at(50), prices: [price(10)] })]);
    expect(r.named).toHaveLength(1);
    expect(r.named[0].name).toBe('Hotel X1');
    expect(r.named[0].prices).toHaveLength(2);
    expect(r.ranking.ranked[0].pricing.amount).toBe(90);
  });

  it('o preço de um registro sem nome absorvido passa ao item com nome e entra no ranking', () => {
    const r = assemble([unnamed('u', { website: 'https://s.test', prices: [price(5)] }), rec('n', { name: 'Hotel S', website: 'https://s.test', ...at(80) })]);
    expect(r.ranking.ranked).toHaveLength(1);
    expect(r.ranking.ranked[0]).toMatchObject({ id: 'n' });
    expect(r.ranking.ranked[0].pricing.amount).toBe(5);
  });

  it('a distância e as coordenadas do item vêm do registro principal (não de outros membros)', () => {
    const r = assemble([unnamed('u', { website: 'https://s.test' }), rec('w', { provider: 'wikivoyage', name: 'Hotel Wiki', website: 'https://s.test', ...at(200) })]);
    expect(r.named[0].id).toBe('w');
    expect(r.named[0].lat).toBeCloseTo(C.lat + ms(200), 6);
    expect(r.named[0].distanceM).toBe(200);
  });
});

describe('CARACTERIZAÇÃO: registros sem nome no agrupamento legado', () => {
  const sum = (r) => ({ count: r.view.unnamed.count, hidden: r.view.counts.unnamedHidden, named: r.named.map((g) => [g.id, g.groupSize]), unnamed: r.unnamedItems.map((g) => [g.id, g.groupSize]) });

  it('hasName: vazio, só espaços, nulo e número contam como sem nome; "---" e "Hotel" contam como nome', () => {
    expect([hasName({ name: '' }), hasName({ name: '   ' }), hasName({ name: null }), hasName({ name: 123 }), hasName({ name: '---' }), hasName({ name: 'Hotel' })]).toEqual([false, false, false, false, true, true]);
  });
  it('unnamed.count e counts.unnamedHidden têm sempre o mesmo valor (itens sem nome)', () => {
    const r = assemble([unnamed('u1'), unnamed('u2', at(1000)), rec('n1', { name: 'Com nome', ...at(2000) })]);
    expect(r.view.unnamed.count).toBe(2);
    expect(r.view.counts.unnamedHidden).toBe(r.view.unnamed.count);
  });
  it('sem nome × sem nome com o mesmo site: agrupados em um item sem nome', () => {
    expect(sum(assemble([unnamed('u1', { website: 'https://s.test' }), unnamed('u2', { website: 'https://s.test', ...at(80) })]))).toMatchObject({ count: 1, named: [], unnamed: [['u1', 2]] });
  });
  it('sem nome × com nome com o mesmo site: absorvido; unnamed.count = 0', () => {
    expect(sum(assemble([unnamed('u1', { website: 'https://s.test' }), rec('n1', { name: 'Hotel S', website: 'https://s.test', ...at(80) })]))).toMatchObject({ count: 0, hidden: 0, named: [['n1', 2]], unnamed: [] });
  });
  it('sem nome × sem nome, e × com nome, com o mesmo telefone: agrupados e absorvido', () => {
    expect(sum(assemble([unnamed('u1', { phone: '211234567' }), unnamed('u2', { phone: '+351 211 234 567', ...at(80) })]))).toMatchObject({ count: 1, unnamed: [['u1', 2]] });
    expect(sum(assemble([unnamed('u1', { phone: '211234567' }), rec('n1', { name: 'Hotel T', phone: '211234567', ...at(80) })]))).toMatchObject({ count: 0, named: [['n1', 2]] });
  });
  it('sem nome × sem nome, e × com nome, com a mesma chave: agrupados e absorvido', () => {
    expect(sum(assemble([unnamed('u1', { sourceId: 'K' }), unnamed('u2', { sourceId: 'K', ...at(80) })]))).toMatchObject({ count: 1, unnamed: [['u1', 2]] });
    expect(sum(assemble([unnamed('u1', { sourceId: 'K' }), rec('n1', { sourceId: 'K', name: 'Hotel K', ...at(80) })]))).toMatchObject({ count: 0, named: [['n1', 2]] });
  });
  it('sem nome sem coordenadas, com município, absorvido por um registro com nome e a mesma chave', () => {
    expect(sum(assemble([unnamed('u1', { sourceId: 'K', lat: null, lon: null, city: 'Lisboa' }), rec('n1', { sourceId: 'K', name: 'Hotel K', city: 'lisboa' })]))).toMatchObject({ count: 0, named: [['n1', 2]] });
  });
  it('mesma chave a mais de 300 m: os dois sem nome continuam separados; sem sinal nenhum, três itens sem nome', () => {
    expect(sum(assemble([unnamed('u1', { sourceId: 'K' }), unnamed('u2', { sourceId: 'K', ...at(400) })])).count).toBe(2);
    expect(sum(assemble([unnamed('u1'), unnamed('u2', at(1000)), unnamed('u3', at(2000))])).count).toBe(3);
  });
  it('o nome NÃO agrupa registros sem nome (as regras de nome exigem nome)', () => {
    expect(sum(assemble([unnamed('u1'), unnamed('u2', at(10))])).count).toBe(2);
  });
  it('duplicatesGrouped (soma de membros − 1) inclui o registro sem nome absorvido', () => {
    const r = assemble([unnamed('u1', { website: 'https://s.test' }), rec('n1', { name: 'Hotel S', website: 'https://s.test', ...at(80) })]);
    expect(r.grouped.reduce((n, g) => n + g.groupSize - 1, 0)).toBe(1);
  });
  it('o item é "sem nome" somente se nenhum membro tem nome; o item usa o nome do principal, mesmo de fonte de menor prioridade', () => {
    const r = assemble([unnamed('u', { website: 'https://s.test' }), rec('w', { provider: 'wikivoyage', name: 'Hotel Wiki', website: 'https://s.test', ...at(150) })]);
    expect(r.unnamedItems).toHaveLength(0);
    expect(r.named[0]).toMatchObject({ id: 'w', name: 'Hotel Wiki' });
  });
  it('o preço de um sem nome separado é classificado, mas ele não entra no ranking', () => {
    const r = assemble([rec('n', { name: 'Com nome', prices: [price(30)] }), unnamed('u', { ...at(1000), prices: [price(5)] })]);
    expect(r.ranking.ranked.map((g) => g.id)).toEqual(['n']);
    expect(r.view.unnamed.items[0].priceClass).toBe('published');
  });
});

describe('CARACTERIZAÇÃO ESTÁTICA: quais campos a interface e o planejador consomem hoje', () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const results = read('../../../components/StayResults.jsx');
  const detail = read('../../../components/PlaceDetail.jsx');
  const stays = read('../../../screens/Stays.jsx');

  it('a lista usa counts.unnamedHidden (não unnamed.count), registries e possibleDuplicates', () => {
    expect(results).toContain('counts.unnamedHidden');
    expect(results).toContain('registries');
    expect(results).toContain('possibleDuplicates');
    expect(results).not.toContain('unnamed.count');
  });
  it('nenhum componente de tela consome groupSize, groupReasons, memberIds nem duplicatesGrouped', () => {
    for (const text of [results, detail, stays]) for (const field of ['groupSize', 'groupReasons', 'memberIds', 'duplicatesGrouped']) expect(text).not.toContain(field);
  });
  it('o detalhe usa registries e possibleDuplicates', () => {
    expect(detail).toContain('registries');
    expect(detail).toContain('possibleDuplicates');
  });
  it('o planejador reconhece um local salvo por `${kind}:${item.id}`, o id do registro principal do grupo', () => {
    expect(stays).toContain('`${kind}:${item.id}`');
  });
});
