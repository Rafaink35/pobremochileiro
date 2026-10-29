import { describe, expect, it } from 'vitest';
import { knownOrigins } from '../knowledge.js';
import { buildKb } from './fixtures.js';
import { assertInterpreter, createRuleInterpreter, parseTripRequest } from '../requestParser.js';

describe('interpretador de pedidos em português', () => {
  it('exemplo do enunciado', () => {
    const r = parseTripRequest('Tenho R$ 600, saio do Rio, quero quatro dias de natureza e não tenho carro.');
    expect(r.complete).toBe(true);
    expect(r.params).toMatchObject({ budget: 600, origin: 'Rio de Janeiro', days: 4, preferences: ['natureza'], hasCar: false });
    expect(r.assumptions.join()).toMatch(/Rio.*Rio de Janeiro/);
    expect(r.evidence.days).toBe('quatro dias');
  });
  it('formatos de dinheiro e duração', () => {
    expect(parseTripRequest('R$ 1.500,50 saindo de São Paulo 3 dias').params).toMatchObject({ budget: 1500.5, origin: 'São Paulo', days: 3 });
    expect(parseTripRequest('tenho 3 mil reais, saio de BH, uma semana').params).toMatchObject({ budget: 3000, origin: 'Belo Horizonte', days: 7 });
    expect(parseTripRequest('dois mil reais partindo de Curitiba, 5 noites').params).toMatchObject({ budget: 2000, origin: 'Curitiba', days: 6 });
    expect(parseTripRequest('800 conto, saio do Rio, 2 dias').params.budget).toBe(800);
  });
  it('várias preferências, pessoas e carro', () => {
    const r = parseTripRequest('Somos em quatro amigos, R$ 2000, saímos... saio de Salvador, 4 dias de praia e camping, tenho carro');
    expect(r.params.preferences).toEqual(['praia', 'camping']);
    expect(r.params.hasCar).toBe(true);
    expect(parseTripRequest('sozinha, R$ 500, saio do Rio, 3 dias').params.people).toBe(1);
    expect(parseTripRequest('casal, R$ 900, saio do Rio, 3 dias').params.people).toBe(2);
  });
  it('falta de informação gera perguntas, não chute', () => {
    const r = parseTripRequest('quero viajar no fim de semana');
    expect(r.complete).toBe(false);
    expect(r.clarifications.map((c) => c.field)).toEqual(['budget', 'origin', 'days']);
    expect(r.params.budget).toBeNull();
    expect(r.clarifications.find((c) => c.field === 'days').question).toMatch(/2, 3 ou 4/);
  });
  it('ambiguidade: dois orçamentos, duas origens e duas durações pedem esclarecimento', () => {
    const r = parseTripRequest('Tenho R$ 600 ou R$ 800, saio do Rio e de São Paulo, 3 dias ou 5 dias');
    expect(r.complete).toBe(false);
    expect(r.clarifications.map((c) => c.field).sort()).toEqual(['budget', 'days', 'origin']);
  });
  it('origem desconhecida pergunta em vez de adivinhar; origens extras da base são aceitas', () => {
    const r = parseTripRequest('R$ 600, saio de Xique-Xique, 3 dias');
    expect(r.clarifications[0]).toMatchObject({ field: 'origin' });
    expect(r.clarifications[0].question).toMatch(/xique/i);
    const ok = parseTripRequest('R$ 600, saio de Xique-Xique, 3 dias', { knownPlaces: [{ name: 'Xique-Xique', aliases: [] }] });
    expect(ok.params.origin).toBe('Xique-Xique');
  });
  it('aceita as origens da própria base (aliases em Set)', () => {
    const { kb } = buildKb();
    const r = parseTripRequest('R$ 900, saio de RJ, 3 dias', { knownPlaces: knownOrigins(kb) });
    expect(r.params.origin).toBe('Rio de Janeiro');
  });
  it('texto vazio ou sem relação com viagem não vira parâmetros', () => {
    expect(parseTripRequest('').complete).toBe(false);
    const r = parseTripRequest('qual a capital da França?');
    expect(r.params).toMatchObject({ budget: null, origin: null, days: null });
    expect(r.complete).toBe(false);
  });
  it('carro desconhecido vira suposição explícita', () => {
    const r = parseTripRequest('R$ 500, saio do Rio, 2 dias');
    expect(r.params.hasCar).toBeNull();
    expect(r.assumptions.join()).toMatch(/carro/);
  });
  it('interface assíncrona declara que não entende frase livre', async () => {
    const i = assertInterpreter(createRuleInterpreter());
    expect(i.understandsFreeText).toBe(false);
    expect((await i.interpret('R$ 600, saio do Rio, 4 dias')).params.budget).toBe(600);
    expect(() => assertInterpreter({})).toThrow();
  });
});
