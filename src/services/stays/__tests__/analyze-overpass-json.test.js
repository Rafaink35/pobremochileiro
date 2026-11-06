// P5: ferramenta LOCAL de análise dos JSON do Overpass. Arquivos de teste INVENTADOS (gerados aqui, em pasta temporária).
import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeElements, analyzeFiles, blockNetwork } from '../../../../scripts/analyze-overpass-json.mjs';

const root = process.cwd();
const NOW = new Date('2026-11-10T12:00:00Z');
const el = (id, tags, lat = 38.7, lon = -9.1, extra = {}) => ({ type: 'node', id, lat, lon, timestamp: '2026-09-01T00:00:00Z', tags, ...extra });
const ELEMENTS = [
  el(1, { tourism: 'hostel', name: 'Hostel A', website: 'https://a.test', phone: '+351 21 111 2222', 'addr:city': 'Lisboa', stars: '2' }, 38.7001, -9.1),
  el(2, { tourism: 'hotel', name: 'Hotel Central' }, 38.7100, -9.1),
  el(3, { tourism: 'hotel', name: 'Hotel Central' }, 38.7500, -9.1), // mesmo nome, 4 km: mantido separado
  el(4, { tourism: 'guest_house', name: 'Pousada Sol' }, 38.7200, -9.1),
  el(5, { tourism: 'guest_house', name: 'Pousada Sol' }, 38.72003, -9.1), // mesmo nome e lugar: agrupa
  el(6, { tourism: 'hotel' }, 38.7300, -9.1), // sem nome
  el(7, { tourism: 'camp_site', name: 'Camping X', fee: 'no' }, 38.7400, -9.1),
  el(8, { tourism: 'hostel', name: 'Hostel Preço', charge: '18 EUR per person per night', 'check_date:charge': '2026-10-20' }, 38.7002, -9.1),
  { type: 'way', id: 9, center: { lat: 38.76, lon: -9.1 }, tags: { tourism: 'hotel', name: 'Hotel Way' } },
  el(10, { tourism: 'hotel', name: 'Sem coordenadas válidas' }, 999, 999),
];

describe('analyzeElements (normalização, deduplicação e classificação reais, sem rede)', () => {
  const a = analyzeElements(ELEMENTS, { center: { lat: 38.7, lon: -9.1 }, limit: 100, now: NOW });

  it('conta os dados brutos como o roteiro PowerShell', () => {
    expect(a.raw).toMatchObject({ total: 10, named: 9, unnamed: 1, website: 1, phone: 1, city: 1, stars: 1, repeatedNameGroups: 2, chargeTag: 1, checkDateCharge: 1 });
    expect(a.raw.elementTypes).toEqual({ node: 9, way: 1 });
    expect(a.raw.feeTag).toEqual({ no: 1 });
    expect(a.raw.priceKeys).toMatchObject({ fee: 1, charge: 1, 'check_date:charge': 1 });
  });

  it('roda a pipeline real: rejeita só o inválido, agrupa por sinal forte e mantém nome repetido separado', () => {
    expect(a.pipeline.validRecords).toBe(9);
    expect(a.pipeline.rejected).toBe(1);
    expect(a.pipeline.duplicatesGrouped).toBe(1); // Pousada Sol (mesmo nome e lugar)
    expect(a.pipeline.repeatedNames).toEqual({ keptSeparate: 1, fullyMerged: 1 }); // Hotel Central ficou separado
    expect(a.pipeline.feeTagKept).toEqual({ no: 1 }); // fee só como observação
    expect(a.pipeline.priceClasses).toMatchObject({ published: 1 }); // só o preço com valor, moeda E check_date:charge
  });

  it('simula a exibição: sem nome fora da lista e contado; limite respeitado', () => {
    expect(a.display).toMatchObject({ limit: 100, unnamedHidden: 1, ranked: 1 });
    const small = analyzeElements(ELEMENTS, { center: { lat: 38.7, lon: -9.1 }, limit: 3, now: NOW });
    expect(small.display.shown).toBe(3);
    expect(small.display.hasMore).toBe(true);
    expect(small.display.omitted).toBeGreaterThan(0);
  });

  it('não imprime nem devolve nomes por padrão (só contagens)', () => {
    const text = JSON.stringify({ raw: a.raw, pipeline: a.pipeline, display: a.display });
    expect(text).not.toMatch(/Hostel A|Hotel Central|Pousada Sol/);
  });

  it('1.300 elementos sintéticos rodam rápido e sem erro', () => {
    const big = Array.from({ length: 1300 }, (_, i) => el(i + 1, { tourism: 'hotel', name: `H ${i}` }, 38.7 + (i % 50) * 0.01, -9.1 + Math.floor(i / 50) * 0.01));
    const t = Date.now();
    const r = analyzeElements(big, { center: { lat: 38.7, lon: -9.1 }, now: NOW });
    expect(r.display.total).toBe(1300);
    expect(r.display.shown).toBe(100);
    expect(Date.now() - t).toBeLessThan(3000);
  });
});

describe('analyzeFiles e a linha de comando', () => {
  it('lê pasta com arquivos, aponta os inválidos e não lança', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ovp-'));
    try {
      writeFileSync(join(dir, 'a.json'), JSON.stringify({ elements: ELEMENTS }));
      writeFileSync(join(dir, 'b.json'), JSON.stringify({ outra: 1 }));
      writeFileSync(join(dir, 'c.json'), '{ não é json');
      const res = analyzeFiles([dir], { now: NOW });
      expect(res.map((r) => r.file)).toEqual(['a.json', 'b.json', 'c.json']);
      expect(res[0].raw.total).toBe(10);
      expect(res[1].error).toMatch(/elements/);
      expect(res[2].error).toMatch(/ler/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a CLI imprime o resumo, sem rede, e termina com código 0; com --center inválido termina com 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ovp-'));
    try {
      writeFileSync(join(dir, 'a.json'), JSON.stringify({ elements: ELEMENTS }));
      const ok = execFileSync('node', ['scripts/analyze-overpass-json.mjs', dir, '--center', '38.7,-9.1'], { cwd: root, encoding: 'utf8' });
      expect(ok).toMatch(/BRUTO: total=10/);
      expect(ok).toMatch(/DEDUPLICAÇÃO/);
      expect(ok).toMatch(/Nenhum dado saiu deste computador/);
      const bad = spawnSync('node', ['scripts/analyze-overpass-json.mjs', dir, '--center', 'xx'], { cwd: root, encoding: 'utf8' });
      expect(bad.status).toBe(2);
      expect(spawnSync('node', ['scripts/analyze-overpass-json.mjs'], { cwd: root, encoding: 'utf8' }).status).toBe(2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('a rede é bloqueada (fetch e conexões) e o bloqueio é desfeito ao final do teste', async () => {
    const originalFetch = globalThis.fetch;
    const restore = blockNetwork();
    try {
      await expect(globalThis.fetch('https://example.com')).rejects.toThrow(/Rede bloqueada/);
      expect(() => net.connect(80, '127.0.0.1')).toThrow(/Rede bloqueada/);
    } finally { restore(); }
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('o código da ferramenta não tem caminho para a rede nem opção de liberá-la', () => {
    const src = readFileSync(join(root, 'scripts/analyze-overpass-json.mjs'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/node:https?['"]|undici|XMLHttpRequest|--allow-network|\bfetch\s*\(/);
  });
});

describe('os JSON reais não entram no Git', () => {
  it('.gitignore cobre as pastas e nomes usados na validação local', () => {
    const ig = readFileSync(join(root, '.gitignore'), 'utf8');
    for (const pattern of ['PobreMochileiro-Validacao/', 'validacao-local/', '*.overpass.json', 'overpass-*.json']) expect(ig).toContain(pattern);
    const check = (path) => spawnSync('git', ['check-ignore', '-q', path], { cwd: root }).status === 0;
    expect(check('PobreMochileiro-Validacao/Lisboa.json')).toBe(true);
    expect(check('validacao-local/x.json')).toBe(true);
    expect(check('Lisboa.overpass.json')).toBe(true);
    expect(check('overpass-lisboa.json')).toBe(true);
  });

  it('nenhum JSON versionado parece resposta do Overpass', () => {
    const files = execFileSync('git', ['ls-files', '*.json'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    const offenders = files.filter((f) => {
      try {
        const j = JSON.parse(readFileSync(join(root, f), 'utf8'));
        return Array.isArray(j?.elements) && j.elements.some((e) => e?.tags?.tourism);
      } catch { return false; }
    });
    expect(offenders).toEqual([]);
  });
});
