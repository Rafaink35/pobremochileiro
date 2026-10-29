// Verificação do roteiro gerado pela IA: nenhum valor em reais é aceito sem corresponder a um resultado
// real devolvido por uma ferramenta (voo, camping, câmbio...). Valor sem fonte vira "não verificado".

export const PLAN_CATEGORIES = ['Transporte', 'Hospedagem', 'Comida', 'Passeios', 'Extras'];

/** Extrai o primeiro objeto JSON de um texto (a IA pode envolver o JSON em cercas de código). */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const sameMoney = (a, b) => Math.abs(a - b) < 0.01;

/**
 * @param parsed   objeto devolvido pela IA ({ resumo, itens, faltando, avisos })
 * @param sources  Map id -> { kind, label, priceBRL (number|null), url, name }
 * @param budget   orçamento informado pelo usuário (número ou null)
 */
export function verifyRoteiro(parsed, sources, budget = null) {
  const rawItems = Array.isArray(parsed?.itens) ? parsed.itens : [];
  const items = rawItems.slice(0, 30).map((it, i) => {
    const src = it.fonte_id ? sources.get(String(it.fonte_id)) : null;
    const claimed = typeof it.valor_brl === 'number' && Number.isFinite(it.valor_brl) ? it.valor_brl : null;
    let amount = null;
    let verified = false;
    let note = typeof it.observacao === 'string' ? it.observacao.slice(0, 300) : null;
    if (claimed !== null) {
      if (src && src.priceBRL !== null && sameMoney(claimed, src.priceBRL)) {
        amount = claimed;
        verified = true;
      } else {
        note = `${note ? `${note} ` : ''}Valor da IA descartado: não bate com nenhuma fonte consultada.`.trim();
      }
    } else if (src && src.priceBRL === 0) {
      amount = 0;
      verified = true;
    }
    const category = PLAN_CATEGORIES.includes(it.categoria) ? it.categoria : 'Extras';
    return {
      id: `r${i}`,
      category,
      label: String(it.descricao ?? '').slice(0, 200) || category,
      amount,
      verified,
      sourceId: src ? String(it.fonte_id) : null,
      sourceName: src?.name ?? null,
      url: src?.url && /^https:\/\//.test(src.url) ? src.url : null,
      note,
    };
  });

  const knownTotal = items.reduce((s, it) => s + (it.amount ?? 0), 0);
  const unverifiedCount = items.filter((it) => it.amount === null).length;
  const missing = Array.isArray(parsed?.faltando) ? parsed.faltando.map(String).slice(0, 15) : [];
  if (unverifiedCount > 0) missing.push(`${unverifiedCount} item(ns) sem valor confirmado por fonte`);
  const complete = missing.length === 0 && items.length > 0;
  let fits = 'indefinido';
  if (budget !== null) {
    if (knownTotal > budget) fits = 'nao';
    else if (complete) fits = 'sim';
  }
  return {
    summary: typeof parsed?.resumo === 'string' ? parsed.resumo.slice(0, 1500) : null,
    items,
    knownTotal,
    budget,
    fits, // 'sim' só com tudo conhecido; 'nao' mesmo com o total parcial; senão 'indefinido'
    missing,
    warnings: Array.isArray(parsed?.avisos) ? parsed.avisos.map(String).slice(0, 8) : [],
  };
}
