import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import prod from '../../../data/knowledge/base.json';
import fixtureRaw from './fixtures/five-scenarios.json';
import {
  emptyKnowledgeBase, guardProductionKnowledgeBase, hasFixtureSources, isEmptyKnowledgeBase, knowledgeCoverage, loadKnowledgeBase,
} from '../knowledge.js';
import { recommend, RECOMMEND_STATUS } from '../recommender.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const base = { days: 5, people: 1, budget: 20000 };
const { kb: fx, errors, warnings } = loadKnowledgeBase(fixtureRaw);

describe('produção: nenhuma base fictícia', () => {
  it('a base de produção está vazia e sem fixtures', () => {
    const { kb } = loadKnowledgeBase(prod);
    expect(isEmptyKnowledgeBase(kb)).toBe(true);
    expect(hasFixtureSources(kb)).toBe(false);
    expect(kb.sources).toEqual([]);
  });

  it('com a base de produção vazia o recomendador não inventa nada', () => {
    const r = recommend({ ...base, origin: 'Rio de Janeiro' }, loadKnowledgeBase(prod).kb, NOW);
    expect(r.status).toBe(RECOMMEND_STATUS.INSUFFICIENT_DATA);
    expect(r.results).toEqual([]);
  });

  it('a trava descarta qualquer base com fonte fixture em produção, mas deixa passar em desenvolvimento', () => {
    expect(hasFixtureSources(fx)).toBe(true);
    const blocked = guardProductionKnowledgeBase(fx, { production: true });
    expect(blocked.blocked).toBe(true);
    expect(isEmptyKnowledgeBase(blocked.kb)).toBe(true);
    expect(guardProductionKnowledgeBase(fx, { production: false }).blocked).toBe(false);
    expect(guardProductionKnowledgeBase(emptyKnowledgeBase(), { production: true }).blocked).toBe(false);
  });

  it('nenhum código de produção importa as fixtures (só testes e o carregamento só de desenvolvimento)', () => {
    const root = join(process.cwd(), 'src');
    const offenders = [];
    const walk = (dir) => {
      for (const f of readdirSync(dir)) {
        const full = join(dir, f);
        if (statSync(full).isDirectory()) { if (f !== '__tests__') walk(full); continue; }
        if (!/\.(jsx?|mjs)$/.test(f)) continue;
        const text = readFileSync(full, 'utf8');
        if (/five-scenarios|fixtures\//.test(text) && relative(root, full) !== join('data', 'knowledge', 'index.js')) offenders.push(relative(root, full));
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
    const index = readFileSync(join(root, 'data/knowledge/index.js'), 'utf8');
    expect(index).toMatch(/import\.meta\.env\.DEV && import\.meta\.env\.VITE_USE_FIXTURES === '1'/);
  });
});

describe('fixtures de desenvolvimento (5 cenários)', () => {
  it('carregam sem erros e se declaram fictícias', () => {
    expect(errors).toEqual([]);
    expect(warnings.filter((w) => !/Uso comercial proibido/.test(w))).toEqual([]);
    expect(fx.sources.every((s) => s.fixture && s.commercialUse === 'prohibited')).toBe(true);
    const prices = [...fx.destinations.flatMap((d) => [d.dailyFood, d.localTransportDaily]), ...fx.transportOptions.map((t) => t.price), ...fx.lodgings.map((l) => l.price)];
    expect(prices.length).toBeGreaterThan(20);
    for (const p of prices) {
      expect(p.status).toBe('estimate');
      expect(p.note).toMatch(/FIXTURE/);
    }
  });

  it('cada destino tem país, moeda local e fuso; destinos não são limitados a país ou continente', () => {
    for (const d of fx.destinations) {
      expect(d.country).toBeTruthy();
      expect(d.localCurrency).toMatch(/^[A-Z]{3}$/);
      expect(d.timezone).toMatch(/\//);
    }
    expect(new Set(fx.destinations.map((d) => d.country)).size).toBeGreaterThanOrEqual(4);
  });

  it.each([
    ['Rio de Janeiro', 'Paraty'], ['Rio de Janeiro', 'São Paulo'], ['Rio de Janeiro', 'Buenos Aires'], ['São Paulo', 'Santiago'], ['São Paulo', 'Lisboa'],
  ])('cenário %s → %s funciona e nunca fecha como total confirmado', (origin, destName) => {
    const r = recommend({ ...base, origin }, fx, NOW);
    expect(r.status).toBe(RECOMMEND_STATUS.OK);
    const res = r.results.find((x) => x.destination.name === destName);
    expect(res).toBeTruthy();
    expect(res.budget.finalCostClaim).not.toBe('confirmed');
  });

  it('não sugere o próprio ponto de partida', () => {
    expect(recommend({ ...base, origin: 'São Paulo' }, fx, NOW).results.map((x) => x.destination.name)).not.toContain('São Paulo');
  });
});

describe('orçamento com valores desconhecidos (sem inventar preço)', () => {
  const kbWith = (mutate) => { const raw = JSON.parse(JSON.stringify(fixtureRaw)); mutate(raw); return loadKnowledgeBase(raw).kb; };
  const paraty = (kb) => recommend({ ...base, origin: 'Rio de Janeiro', destinationId: 'paraty' }, kb, NOW).results[0];

  it('sem preço de hospedagem: custo vira "indisponível", resultado parcial e nunca "cabe"', () => {
    const kb = kbWith((r) => { r.lodgings = r.lodgings.filter((l) => l.destinationId !== 'paraty'); });
    const res = paraty(kb);
    expect(res.budget.fit).toBe('within_partial');
    expect(res.budget.pending.some((p) => p.category === 'lodging' && p.essential)).toBe(true);
    expect(res.budget.finalCostClaim).toBe('incomplete');
    expect(res.reasons.some((x) => x.code === 'partial_result' && /Não dá para afirmar que cabe/.test(x.text))).toBe(true);
    expect(res.reasons.some((x) => x.code === 'within_budget')).toBe(false);
  });

  it('sem nenhum preço verificável o resultado é inconclusivo, nunca zero', () => {
    const kb = kbWith((r) => { r.transportOptions = []; r.lodgings = []; for (const d of r.destinations) { delete d.dailyFood; delete d.localTransportDaily; } });
    const res = paraty(kb);
    expect(res.budget.fit).toBe('unknown');
    expect(res.budget.minimumTotal).toBe(0);
    expect(res.budget.lines.every((l) => l.total.amount === null)).toBe(true);
    expect(res.reasons[0].code).toBe('no_data');
  });

  it('só passa a "cabe" quando não há nenhum custo pendente', () => {
    const res = paraty(fx);
    expect(res.budget.pending).toEqual([]);
    expect(res.budget.fit).toBe('within');
  });
});

describe('cobertura para receber fontes reais', () => {
  it('a base vazia tem cobertura zero e a de fixtures mostra o que falta', () => {
    expect(knowledgeCoverage(emptyKnowledgeBase()).summary).toMatchObject({ destinations: 0, fullyCovered: 0, withVerifiedPrices: 0 });
    const c = knowledgeCoverage(fx);
    expect(c.summary.destinations).toBe(5);
    expect(c.summary.withVerifiedPrices).toBe(0); // estimativa não é preço verificado
    expect(c.summary.fixtureSources).toBe(1);
    expect(c.destinations.find((d) => d.id === 'paraty').missing).toEqual([]);
  });

  it('destino sem dados lista tudo o que falta', () => {
    const kb = loadKnowledgeBase({ ...emptyKnowledgeBase(), destinations: [{ id: 'x', name: 'X' }] }).kb;
    expect(knowledgeCoverage(kb).destinations[0].missing).toEqual(['transporte', 'hospedagem', 'alimentação', 'deslocamento local']);
  });
});
