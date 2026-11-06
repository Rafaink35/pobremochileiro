// E0: TESTES DE CARACTERIZAÇÃO das chaves de origem emitidas pelos adaptadores do Stay Finder e do efeito delas no agrupamento.
// [CARACTERIZAÇÃO: comportamento atual, NÃO é requisito definitivo.] Dados SIMULADOS e fictícios (CSV e wikitexto inventados).
import { describe, expect, it } from 'vitest';
import { groupDuplicates } from '../dedupe.js';
import { toStayRecord as osmStay } from '../sources/osm.js';
import { toStayRecord as cadasturStay } from '../sources/cadastur.js';
import { toStayRecord as communityStay } from '../sources/community.js';
import { parseSleepListings } from '../sources/wikivoyage.js';
import { normalizeCadasturCsv } from '../../datalayer/sources/cadastur.js';

const COLLECTED = '2026-11-06T12:00:00.000Z';
const osmEl = (type, id, tags = {}) => ({ type, id, lat: 38.7, lon: -9.1, timestamp: '2026-01-01T00:00:00Z', tags: { tourism: 'hotel', name: 'Hotel A', ...tags } });
const cadRows = (csv) => normalizeCadasturCsv(csv, { referenceDate: '2026-01-01' }).records;
const cadStays = (csv) => cadRows(csv).map((e) => cadasturStay(e, { collectedAt: COLLECTED }));
const unkey = (recs) => recs.map((r, i) => ({ ...r, id: `${r.id}#${i}`, sourceId: `${r.sourceId}#${i}`, sources: [{ ...r.sources[0], originalId: `${r.sourceId}#${i}` }] }));
const wiki = (items) => items.map((x) => `{{listing|type=sleep|name=${x.name ?? ''}|lat=${x.lat ?? ''}|long=${x.lon ?? ''}}}`).join('\n');

describe('CARACTERIZAÇÃO: nenhum adaptador declara categoria nem variante da chave', () => {
  it('OSM, Cadastur e comunidade não emitem key, variant nem variantStatus', () => {
    const o = osmStay(osmEl('node', 1), { collectedAt: COLLECTED });
    const c = cadStays('nome;atividade;municipio;uf\nHotel X;Hotel;Lisboa;SC\n')[0];
    const m = communityStay({ id: 'c1', name: 'Local', category: 'hostel', status: 'approved' }, { collectedAt: COLLECTED });
    for (const r of [o, c, m]) for (const field of ['key', 'variant', 'variantStatus', 'sourceIdCategory']) expect(field in r).toBe(false);
  });
  it('Wikivoyage também não emite esses campos', () => {
    const { records } = parseSleepListings(wiki([{ name: 'Alfa', lat: 38.7, lon: -9.1 }]), { title: 'Lisbon', revisionAt: 'r', destination: null, collectedAt: COLLECTED });
    for (const field of ['key', 'variant', 'variantStatus', 'sourceIdCategory']) expect(field in records[0]).toBe(false);
  });
});

describe('CARACTERIZAÇÃO: OSM', () => {
  it('a chave é tipo/id: node/1 e way/1 são chaves diferentes; o id do registro é osm:<chave>', () => {
    const n = osmStay(osmEl('node', 1), { collectedAt: COLLECTED });
    const w = osmStay(osmEl('way', 1), { collectedAt: COLLECTED });
    expect([n.sourceId, n.id, w.sourceId, w.id]).toEqual(['node/1', 'osm:node/1', 'way/1', 'osm:way/1']);
  });
});

describe('CARACTERIZAÇÃO: Wikivoyage', () => {
  const parse = (items, revisionAt) => parseSleepListings(wiki(items), { title: 'Lisbon', revisionAt, destination: null, collectedAt: COLLECTED }).records.map((r) => [r.name, r.sourceId]);
  const base = [{ name: 'Alfa', lat: 38.7, lon: -9.1 }, { name: 'Beta', lat: 38.7001, lon: -9.1 }];

  it('a chave é título#ordem', () => {
    expect(parse(base, 'r1')).toEqual([['Alfa', 'Lisbon#1'], ['Beta', 'Lisbon#2']]);
  });
  it('a ordem conta também as listagens descartadas (sem coordenadas): a mesma listagem muda de chave', () => {
    expect(parse([{ name: 'SemCoordenadas' }, ...base], 'r2')).toEqual([['Alfa', 'Lisbon#2'], ['Beta', 'Lisbon#3']]);
  });
  it('a data da revisão não faz parte da chave', () => {
    expect(parse(base, 'revisão-A')).toEqual(parse(base, 'revisão-B'));
  });
  it('o registro nasce "não classificado" e sem preço sem lastedit', () => {
    const [r] = parseSleepListings('{{listing|type=sleep|name=Alfa|lat=38.7|long=-9.1|price=20 EUR per person per night}}', { title: 'Lisbon', revisionAt: 'r', destination: null, collectedAt: COLLECTED }).records;
    expect(r.category).toBe('nao_classificada');
    expect(r.prices[0]?.observedAt ?? null).toBeNull();
  });
});

describe('CARACTERIZAÇÃO: Cadastur (chave derivada quando falta o id)', () => {
  it('sem coluna de id: a chave é nome|município|UF normalizados; linhas repetidas compartilham a chave', () => {
    const ids = cadRows('nome;atividade;municipio;uf\nHotel Exemplo;Hotel;Lisboa;SC\nHotel Exemplo;Hotel;LISBOA;SC\n').map((r) => r.source_id);
    expect(ids).toEqual(['hotel exemplo|lisboa|SC', 'hotel exemplo|lisboa|SC']);
  });
  it('com a coluna de id (aceita "cnpj", "codigo", "id", entre outras), a chave é o valor da coluna', () => {
    expect(cadRows('nome;atividade;municipio;uf;cnpj\nHotel Exemplo;Hotel;Lisboa;SC;111\nHotel Exemplo;Hotel;Lisboa;SC;222\n').map((r) => r.source_id)).toEqual(['111', '222']);
    expect(cadRows('nome;atividade;municipio;uf;codigo\nHotel Exemplo;Hotel;Lisboa;SC;A1\n').map((r) => r.source_id)).toEqual(['A1']);
  });
  it('uma coluna de id presente mas vazia numa linha cai na chave derivada, no mesmo arquivo', () => {
    expect(cadRows('nome;atividade;municipio;uf;cnpj\nHotel Exemplo;Hotel;Lisboa;SC;111\nPousada Sol;Pousada;Lisboa;SC;\n').map((r) => r.source_id)).toEqual(['111', 'pousada sol|lisboa|SC']);
  });
  it('a chave derivada ignora acentos e caixa; municípios com acento diferente na grafia geram a mesma chave', () => {
    expect(cadRows('nome;atividade;municipio;uf\nPousada Sol;Pousada;São José;SC\nPOUSADA SOL;Pousada;SAO JOSE;SC\n').map((r) => r.source_id)).toEqual(['pousada sol|sao jose|SC', 'pousada sol|sao jose|SC']);
  });
  it('linhas repetidas, mesma categoria: o par agrupa e o motivo registrado é a chave; sem a chave ainda agrupa por nome e município', () => {
    const recs = cadStays('nome;atividade;municipio;uf\nHotel Exemplo;Hotel;Lisboa;SC\nHotel Exemplo;Hotel;Lisboa;SC\n');
    const [g] = groupDuplicates(recs);
    expect(g.groupSize).toBe(2);
    expect(g.groupReasons).toEqual(['mesmo registro da fonte']);
    expect(groupDuplicates(unkey(recs))[0].groupReasons).toEqual(['mesmo nome e município (sem coordenadas)']);
  });
  it('linhas com a mesma chave e categorias diferentes: só a chave as une; sem ela, dois itens', () => {
    const recs = cadStays('nome;atividade;municipio;uf\nPousada Sol;Pousada;Lisboa;SC\nPousada Sol;Hotel;Lisboa;SC\n');
    expect(recs[0].sourceId).toBe(recs[1].sourceId);
    expect(groupDuplicates(recs)).toHaveLength(1);
    expect(groupDuplicates(unkey(recs))).toHaveLength(2);
  });
  it('registros com a mesma chave têm o mesmo id: memberIds colapsa em um e groupSize conta dois', () => {
    const [g] = groupDuplicates(cadStays('nome;atividade;municipio;uf\nHotel Exemplo;Hotel;Lisboa;SC\nHotel Exemplo;Hotel;Lisboa;SC\n'));
    expect(g.groupSize).toBe(2);
    expect(g.memberIds).toHaveLength(1);
  });
});

describe('CARACTERIZAÇÃO: comunidade', () => {
  it('a chave é o id do cadastro; o id do registro é community:<id>', () => {
    const r = communityStay({ id: 'abc', name: 'Local', category: 'hostel', status: 'approved' }, { collectedAt: COLLECTED });
    expect([r.sourceId, r.id]).toEqual(['abc', 'community:abc']);
  });
});
