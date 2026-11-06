import { describe, expect, it } from 'vitest';
import { nameSimilarity, normText, phoneDigits, tokens, websiteDomain } from '../unicode.js';
import { bestPrice, classifyStayPrice, parseStayCharge, PRICE_CLASS, VALIDITY_DAYS } from '../price.js';
import { NOW } from './fixtures/index.js';

describe('normalização Unicode', () => {
  it('tira acentos de letras latinas, gregas e cirílicas', () => {
    expect(normText('Pousada São João')).toBe('pousada sao joao');
    expect(normText('Café Ñandú')).toBe('cafe nandu');
    expect(normText('Ξενοδοχείο Αθήνα')).toBe('ξενοδοχειο αθηνα');
    expect(normText('Хостел «Москва»')).toBe('хостел москва');
  });
  it('preserva outras escritas (japonês, chinês, árabe, tailandês, coreano)', () => {
    expect(normText('渋谷ゲストハウス')).toBe('渋谷ゲストハウス');
    expect(normText('ばば')).toBe('ばば'); // dakuten não é removido
    expect(normText('北京 青年旅舍')).toBe('北京 青年旅舍');
    expect(normText('فندق القاهرة')).toBe('فندق القاهرة');
    expect(normText('โรงแรม เชียงใหม่')).toBe('โรงแรม เชียงใหม่');
    expect(normText('서울 게스트하우스')).toBe('서울 게스트하우스');
  });
  it('pontuação e espaços repetidos viram um espaço; vazio continua vazio', () => {
    expect(normText('  Casa--do   Mar!! ')).toBe('casa do mar');
    expect(normText(null)).toBe('');
  });
  it('palavras genéricas de vários idiomas são ignoradas na comparação', () => {
    expect(tokens('Hostal El Sol')).toEqual(['sol']);
    expect(tokens('Pousada do Sol')).toEqual(['sol']);
  });
  it('similaridade funciona em escritas sem espaço', () => {
    expect(nameSimilarity('渋谷ゲストハウス', '渋谷 ゲストハウス')).toBeGreaterThanOrEqual(0.6);
    expect(nameSimilarity('渋谷ゲストハウス', '浅草ホステル')).toBeLessThan(0.6);
    expect(nameSimilarity('Casa Verde', 'Casa Azul')).toBeLessThan(0.6);
    expect(nameSimilarity('Casa do Mar Verde', 'Mar Verde Casa')).toBeGreaterThanOrEqual(0.6);
    expect(nameSimilarity('', 'x')).toBe(0);
  });
  it('domínio de site ignora redes sociais e portais; telefone curto não identifica', () => {
    expect(websiteDomain('https://www.alfama-exemplo.test/pt')).toBe('alfama-exemplo.test');
    expect(websiteDomain('https://www.facebook.com/minhapousada')).toBeNull();
    expect(websiteDomain('https://booking.com/hotel/x')).toBeNull();
    expect(websiteDomain('nao é url')).toBeNull();
    expect(phoneDigits('+351 21 123 4567')).toBe('211234567');
    expect(phoneDigits('12345')).toBeNull();
  });
});

describe('leitura de preço de texto de fonte', () => {
  it.each([
    ['30 BRL', { amount: 30, currency: 'BRL', unit: null }],
    ['R$ 25,50', { amount: 25.5, currency: 'BRL', unit: null }],
    ['€20 per person per night', { amount: 20, currency: 'EUR', unit: { basis: 'person', period: 'night' } }],
    ['90 EUR/room/night', { amount: 90, currency: 'EUR', unit: { basis: 'room', period: 'night' } }],
    ['ARS 12.500 por persona por noche', { amount: 12500, currency: 'ARS', unit: { basis: 'person', period: 'night' } }],
    ['15000 CLP per person per night', { amount: 15000, currency: 'CLP', unit: { basis: 'person', period: 'night' } }],
    ['3500 JPY per person per night', { amount: 3500, currency: 'JPY', unit: { basis: 'person', period: 'night' } }],
    ['R$ 280 por quarto por noite', { amount: 280, currency: 'BRL', unit: { basis: 'room', period: 'night' } }],
    ['1,500 USD per room per night', { amount: 1500, currency: 'USD', unit: { basis: 'room', period: 'night' } }],
    ['฿ 400 per night', { amount: 400, currency: 'THB', unit: null }], // sem pessoa/quarto: unidade incompleta
  ])('lê %s', (text, expected) => {
    expect(parseStayCharge(text)).toMatchObject(expected);
  });
  it.each(['20-30 EUR', 'dorm 15 EUR / private 40 EUR', '$20', '¥3000', '20', 'grátis', '', null, 'EUR', 'XYZ 20'])('recusa o ambíguo ou incompleto: %s', (text) => {
    expect(parseStayCharge(text)).toBeNull();
  });
  it('pessoa e quarto no mesmo texto deixam a unidade desconhecida', () => {
    expect(parseStayCharge('20 EUR per person or room per night').unit).toBeNull();
  });
});

describe('classificação do preço (prazos: 30 dias confirmado, 180 dias publicado)', () => {
  const at = (days) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
  const base = { amount: 20, currency: 'EUR', unit: { basis: 'person', period: 'night' } };

  it('constantes de prazo', () => expect(VALIDITY_DAYS).toEqual({ confirmed: 30, published: 180 }));
  it('confirmado: vale até 30 dias, depois é desatualizado', () => {
    expect(classifyStayPrice({ ...base, status: 'confirmed', observedAt: at(30) }, NOW).class).toBe(PRICE_CLASS.CONFIRMED);
    expect(classifyStayPrice({ ...base, status: 'confirmed', observedAt: at(31) }, NOW).class).toBe(PRICE_CLASS.STALE);
  });
  it('publicado: vale até 180 dias, depois é desatualizado', () => {
    expect(classifyStayPrice({ ...base, status: 'published', observedAt: at(180) }, NOW).class).toBe(PRICE_CLASS.PUBLISHED);
    expect(classifyStayPrice({ ...base, status: 'published', observedAt: at(181) }, NOW).class).toBe(PRICE_CLASS.STALE);
  });
  it('validUntil anterior ao prazo vence antes', () => {
    expect(classifyStayPrice({ ...base, status: 'published', observedAt: at(10), validUntil: at(1) }, NOW).class).toBe(PRICE_CLASS.STALE);
  });
  it('sem data da fonte, sem valor, sem moeda, data futura ou estimativa: indisponível', () => {
    expect(classifyStayPrice({ ...base, status: 'published' }, NOW).class).toBe('unavailable');
    expect(classifyStayPrice({ ...base, status: 'published', observedAt: at(1), amount: 0 }, NOW).class).toBe('unavailable');
    expect(classifyStayPrice({ ...base, status: 'published', observedAt: at(1), currency: null }, NOW).class).toBe('unavailable');
    expect(classifyStayPrice({ ...base, status: 'published', observedAt: new Date(NOW.getTime() + 10 * 86_400_000).toISOString() }, NOW).class).toBe('unavailable');
    expect(classifyStayPrice({ ...base, status: 'estimate', observedAt: at(1) }, NOW).class).toBe('unavailable');
    expect(classifyStayPrice(null, NOW).class).toBe('unavailable');
  });
  it('gratuito segundo a fonte também depende da data; não é comparável', () => {
    const p = classifyStayPrice({ status: 'published', free: true, observedAt: at(5) }, NOW);
    expect(p).toMatchObject({ class: 'published', free: true, comparable: false });
  });
  it('unidade sem "por noite" não é comparável', () => {
    expect(classifyStayPrice({ ...base, status: 'published', observedAt: at(1), unit: null }, NOW).comparable).toBe(false);
    expect(classifyStayPrice({ ...base, status: 'published', observedAt: at(1) }, NOW).comparable).toBe(true);
  });
  it('o melhor preço de um local prefere confirmado atual a publicado atual a desatualizado', () => {
    const prices = [
      { ...base, status: 'published', observedAt: at(5), source: { name: 'A' } },
      { ...base, status: 'confirmed', observedAt: at(5), amount: 30, source: { name: 'B' } },
      { ...base, status: 'published', observedAt: at(400), amount: 5, source: { name: 'C' } },
    ];
    const best = bestPrice(prices, NOW);
    expect(best.class).toBe('confirmed');
    expect(best.source.name).toBe('B');
    expect(bestPrice([], NOW).class).toBe('unavailable');
  });
});
