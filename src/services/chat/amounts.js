// Detecta valores em reais citados no texto da IA que não vieram de nenhuma fonte (ferramenta, plano ou usuário).

/** "1.728,50" -> 1728.5 ; "3000" -> 3000 ; "3,5" -> 3.5 */
export function parseBrNumber(text) {
  let s = String(text).trim();
  if (!/\d/.test(s)) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Valores "R$ x" encontrados no texto. "R$ 3 mil" conta como 3000. */
export function extractReaisAmounts(text) {
  const out = [];
  for (const m of String(text).matchAll(/R\$\s*(\d[\d.,]*)(\s*(?:mil|k)\b)?/gi)) {
    const n = parseBrNumber(m[1].replace(/[.,]$/, ''));
    if (Number.isFinite(n)) out.push(m[2] ? n * 1000 : n);
  }
  return out;
}

/** Números escritos pelo usuário (qualquer número vira valor permitido para a IA repetir). */
export function extractUserNumbers(text) {
  const out = [];
  for (const m of String(text).matchAll(/(\d[\d.,]*)(\s*(?:mil|k)\b)?/gi)) {
    const n = parseBrNumber(m[1].replace(/[.,]$/, ''));
    if (Number.isFinite(n)) out.push(m[2] ? n * 1000 : n);
  }
  return out;
}

/** Valores citados que não estão no conjunto permitido (tolerância de 1 centavo). */
export function findUnverifiedAmounts(text, allowed) {
  const list = [...allowed];
  return [...new Set(extractReaisAmounts(text))].filter((n) => !list.some((a) => Math.abs(a - n) < 0.011));
}
