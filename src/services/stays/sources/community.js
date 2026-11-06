// Cadastro próprio (comunidade) com moderação: arquitetura pronta, SEM dados e SEM banco nesta etapa.
// `load(destination, categories)` deve devolver só registros APROVADOS por moderação (ver submissions.js). Sem `load`
// configurado a fonte aparece como "não configurada": nenhum estabelecimento ou preço é inventado.
import { parseStayCharge } from '../price.js';

export const COMMUNITY_SOURCE = Object.freeze({
  id: 'community', name: 'Cadastro Pobre Mochileiro (moderado)', license: 'Termos próprios (a definir)', licenseUrl: null, attribution: 'Pobre Mochileiro e contribuidores', url: null,
});

/** Registro aprovado → registro do Stay Finder. Preço confirmado exige evidência e data (validado na moderação). */
export function toStayRecord(a, { collectedAt }) {
  const source = { provider: 'community', name: COMMUNITY_SOURCE.name, license: COMMUNITY_SOURCE.license, licenseUrl: null, attribution: COMMUNITY_SOURCE.attribution, copyrightUrl: null, originalId: a.id, sourceUrl: a.evidenceUrl ?? null, collectedAt, lastEditedAt: a.approvedAt ?? null };
  const prices = (a.prices ?? []).filter((p) => p.approved).map((p) => {
    const parsed = p.amount ? { amount: Number(p.amount), currency: p.currency, unit: p.unit ?? null } : parseStayCharge(p.text ?? '');
    return parsed ? { status: p.status === 'confirmed' ? 'confirmed' : 'published', amount: parsed.amount, currency: parsed.currency, unit: parsed.unit, observedAt: p.observedAt, validUntil: p.validUntil ?? null, text: p.text ?? null, source: { provider: 'community', name: COMMUNITY_SOURCE.name, license: COMMUNITY_SOURCE.license, attribution: COMMUNITY_SOURCE.attribution, url: p.evidenceUrl ?? null } } : null;
  }).filter(Boolean);
  return {
    id: `community:${a.id}`, provider: 'community', sourceId: a.id, name: a.name, category: a.category, osmKind: null, lat: a.lat ?? null, lon: a.lon ?? null,
    address: a.address ?? null, city: a.city ?? null, region: a.region ?? null, country: a.country ?? null, website: a.website ?? null, phone: null, email: null,
    stars: null, openingHours: null, access: null, amenities: {}, tents: null, caravans: null, fee: 'unknown', priceText: null, openStatus: 'unknown', prices, sources: [source],
  };
}

export function createCommunityStaySource({ load = null, now = () => new Date() } = {}) {
  return {
    id: COMMUNITY_SOURCE.id,
    describe: () => ({ ...COMMUNITY_SOURCE }),
    supports: () => (load ? { ok: true } : { ok: false, notConfigured: true, reason: 'cadastro próprio ainda não ativado (fase posterior)' }),
    async search({ destination, categories }) {
      const collectedAt = now().toISOString();
      const rows = await load(destination, categories);
      const records = (rows ?? []).filter((r) => r?.status === 'approved' && categories.includes(r.category)).map((r) => toStayRecord(r, { collectedAt }));
      return { records, rejected: 0, collectedAt };
    },
  };
}
