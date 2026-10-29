// Modelo dos relatos com foto (estilo feed). Regras puras, testáveis sem o Supabase.
import { MAX_IMAGES } from './images.js';

export const POST_TYPES = ['Dica', 'Planejamento', 'Natureza', 'Cidade', 'Praia', 'Camping', 'Trabalho em troca', 'Ônibus e voos', 'Perrengue'];

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Linha do banco -> relato da interface. `urlFor(path)` monta a URL pública da foto. */
export function normalizePost(row, { likeCounts = new Map(), likedIds = new Set(), urlFor = (p) => p } = {}) {
  const cost = row.trip_cost_brl === null || row.trip_cost_brl === undefined ? null : Number(row.trip_cost_brl);
  return {
    id: row.id,
    userId: row.user_id,
    author: text(row.author_name) ?? 'viajante',
    type: row.type,
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    createdAt: row.created_at,
    place: text(row.place_name),
    tip: text(row.tip),
    costBRL: Number.isFinite(cost) && cost >= 0 ? cost : null, // informado pelo autor, não verificado
    days: Number.isInteger(row.trip_days) && row.trip_days > 0 ? row.trip_days : null,
    images: (Array.isArray(row.images) ? row.images : []).slice(0, MAX_IMAGES).map(urlFor),
    community: row.communities?.name ?? null,
    likes: likeCounts.get(row.id) ?? 0,
    liked: likedIds.has(row.id),
    hidden: Boolean(row.hidden),
  };
}

/** Valida o formulário de novo relato. Retorna a lista de problemas (vazia = ok). */
export function validatePostDraft(d, imageCount = 0) {
  const problems = [];
  if (!POST_TYPES.includes(d.type)) problems.push('Escolha o tipo do relato.');
  if (String(d.title ?? '').trim().length < 3 || d.title.length > 120) problems.push('O título precisa ter de 3 a 120 caracteres.');
  if (String(d.body ?? '').trim().length < 3 || d.body.length > 2000) problems.push('O relato precisa ter de 3 a 2000 caracteres.');
  if (d.tip && d.tip.length > 500) problems.push('A dica pode ter até 500 caracteres.');
  if (d.place && d.place.length > 80) problems.push('O lugar pode ter até 80 caracteres.');
  if (d.costBRL !== '' && d.costBRL !== null && d.costBRL !== undefined) {
    const n = Number(String(d.costBRL).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) problems.push('Informe o gasto em reais (ou deixe em branco).');
  }
  if (d.days !== '' && d.days !== null && d.days !== undefined) {
    const n = Number(d.days);
    if (!Number.isInteger(n) || n < 1 || n > 365) problems.push('Dias de viagem: de 1 a 365.');
  }
  if (imageCount > MAX_IMAGES) problems.push(`No máximo ${MAX_IMAGES} fotos.`);
  return problems;
}

/** Campos prontos para o insert (números convertidos, vazios viram null). */
export function postPayload(d, imagePaths) {
  const cost = d.costBRL === '' || d.costBRL == null ? null : Number(String(d.costBRL).replace(/\./g, '').replace(',', '.'));
  return {
    type: d.type,
    title: d.title.trim(),
    body: d.body.trim(),
    tip: text(d.tip),
    place_name: text(d.place),
    trip_cost_brl: cost,
    trip_days: d.days === '' || d.days == null ? null : Number(d.days),
    images: imagePaths,
  };
}

export function costLabel(post) {
  if (post.costBRL === null) return null;
  const v = post.costBRL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `Gastou ${v}${post.days ? ` em ${post.days} ${post.days === 1 ? 'dia' : 'dias'}` : ''} (informado pelo autor, não verificado)`;
}
