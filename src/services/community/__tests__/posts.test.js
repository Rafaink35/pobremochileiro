import { describe, expect, it } from 'vitest';
import { MAX_IMAGES, fitSize, imagePath, validateImageFile } from '../images.js';
import { costLabel, normalizePost, postPayload, validatePostDraft } from '../postModel.js';

const row = (o = {}) => ({
  id: 'p1', user_id: 'u1', author_name: 'bia', type: 'Dica', title: 'Leve lanterna', body: 'Sempre.',
  created_at: '2026-10-01T10:00:00Z', images: ['u1/a.jpg', 'u1/b.jpg'], place_name: ' Paraty ', tip: ' Chegue cedo ',
  trip_cost_brl: '350.5', trip_days: 3, communities: { name: 'Camping' }, hidden: false, ...o,
});
const NOW = {};

describe('fotos', () => {
  it('valida tipo, tamanho e quantidade', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateImageFile({ type: 'application/pdf', size: 1000 })).toMatch(/JPG/);
    expect(validateImageFile({ type: 'image/gif', size: 1000 })).toMatch(/JPG/);
    expect(validateImageFile({ type: 'image/png', size: 13 * 1024 * 1024 })).toMatch(/grande/);
    expect(validateImageFile({ type: 'image/jpeg', size: 1 }, MAX_IMAGES)).toMatch(/No máximo/);
    expect(validateImageFile(null)).toMatch(/JPG/);
  });
  it('reduz mantendo a proporção e nunca amplia', () => {
    expect(fitSize(4000, 2000, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitSize(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitSize(0, 10)).toBeNull();
  });
  it('caminho fica na pasta do usuário (regra do bucket)', () => {
    expect(imagePath('u1', 'x')).toBe('u1/x.jpg');
  });
});

describe('relato', () => {
  it('normaliza com fotos, curtidas, dica e gasto informado', () => {
    const p = normalizePost(row(), { likeCounts: new Map([['p1', 4]]), likedIds: new Set(['p1']), urlFor: (x) => `https://cdn/${x}` });
    expect(p).toMatchObject({ place: 'Paraty', tip: 'Chegue cedo', costBRL: 350.5, days: 3, likes: 4, liked: true, community: 'Camping' });
    expect(p.images).toEqual(['https://cdn/u1/a.jpg', 'https://cdn/u1/b.jpg']);
  });
  it('sem foto, dica, lugar ou gasto: tudo fica nulo, nada inventado', () => {
    const p = normalizePost(row({ images: null, place_name: '', tip: null, trip_cost_brl: null, trip_days: null, communities: null }));
    expect(p).toMatchObject({ images: [], place: null, tip: null, costBRL: null, days: null, community: null, likes: 0, liked: false });
    expect(costLabel(p)).toBeNull();
  });
  it('limita a 4 fotos e o rótulo de gasto avisa que não é verificado', () => {
    expect(normalizePost(row({ images: ['a', 'b', 'c', 'd', 'e'] })).images).toHaveLength(4);
    expect(costLabel(normalizePost(row()))).toMatch(/R\$\s350,50 em 3 dias \(informado pelo autor, não verificado\)/);
    expect(costLabel({ costBRL: 0, days: null })).toMatch(/R\$\s0,00 \(informado/);
  });
  it('valida o formulário', () => {
    const ok = { type: 'Dica', title: 'Título bom', body: 'Texto bom', tip: '', place: '', costBRL: '', days: '' };
    expect(validatePostDraft(ok)).toEqual([]);
    expect(validatePostDraft({ ...ok, title: 'ab' })[0]).toMatch(/título/);
    expect(validatePostDraft({ ...ok, type: 'Outro' })[0]).toMatch(/tipo/);
    expect(validatePostDraft({ ...ok, costBRL: 'abc' })[0]).toMatch(/gasto/);
    expect(validatePostDraft({ ...ok, days: '400' })[0]).toMatch(/Dias/);
    expect(validatePostDraft(ok, 5)[0]).toMatch(/fotos/);
  });
  it('payload converte números e vazios viram null', () => {
    const d = { type: 'Dica', title: ' T ok ', body: ' B ok ', tip: '', place: 'Paraty', costBRL: '1.250,50', days: '4' };
    expect(postPayload(d, ['u1/a.jpg'])).toEqual({ type: 'Dica', title: 'T ok', body: 'B ok', tip: null, place_name: 'Paraty', trip_cost_brl: 1250.5, trip_days: 4, images: ['u1/a.jpg'] });
    expect(postPayload({ ...d, costBRL: '', days: '' }, []).trip_cost_brl).toBeNull();
  });
});
