// Normalização de texto para QUALQUER alfabeto (latino, cirílico, grego, árabe, tailandês, japonês, chinês...).
// Só tira acentos de letras latinas, gregas e cirílicas: em kana, dakuten e similares fazem parte da letra.
// Pontuação e símbolos viram espaço; letras e números de qualquer escrita são preservados.
export function normText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/([\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}])\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Palavras genéricas de hospedagem em vários idiomas: não distinguem um local do outro.
const STOP = new Set([
  'hotel', 'motel', 'hostel', 'hostal', 'albergue', 'auberge', 'pousada', 'pousadas', 'pension', 'pensao', 'pensione', 'posada', 'camping', 'campsite', 'campground',
  'guest', 'house', 'guesthouse', 'inn', 'lodge', 'resort', 'de', 'da', 'do', 'das', 'dos', 'del', 'la', 'le', 'les', 'el', 'los', 'las', 'the', 'of', 'and', 'e', 'y', 'et', 'und',
  'ホテル', '旅館', 'ホステル', 'ゲストハウス', '民宿', '酒店', '旅馆', '宾馆', '青年旅舍', 'гостиница', 'отель', 'хостел', 'فندق', 'โรงแรม',
]);

// Em escritas sem espaço entre palavras (japonês, chinês, tailandês), a palavra genérica vem colada ao nome: remove também como trecho.
const UNSPACED_STOP = [...STOP].filter((w) => /[^\u0000-\u024f]/.test(w)).sort((a, b) => b.length - a.length);

export function tokens(s) {
  return normText(s)
    .split(' ')
    .filter((t) => t && !STOP.has(t))
    .map((t) => (/[^\u0000-\u024f]/.test(t) ? UNSPACED_STOP.reduce((acc, w) => acc.split(w).join(''), t) : t))
    .filter(Boolean);
}

const bigrams = (str) => {
  const chars = [...str];
  if (chars.length < 2) return chars.length ? [chars[0]] : [];
  return chars.slice(0, -1).map((c, i) => c + chars[i + 1]);
};

/**
 * Similaridade de nomes (0 a 1). Nomes com várias palavras: proporção de termos em comum.
 * Escritas sem espaço entre palavras (japonês, chinês, tailandês): coeficiente de Dice sobre pares de caracteres.
 */
export function nameSimilarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  if (ta.length > 1 && tb.length > 1) {
    const sb = new Set(tb);
    const common = new Set(ta.filter((t) => sb.has(t))).size;
    return common / Math.max(new Set(ta).size, sb.size);
  }
  const ba = bigrams(ta.join(''));
  const bb = bigrams(tb.join(''));
  if (!ba.length || !bb.length) return 0;
  const counts = new Map();
  for (const g of bb) counts.set(g, (counts.get(g) ?? 0) + 1);
  let common = 0;
  for (const g of ba) {
    if ((counts.get(g) ?? 0) > 0) {
      common += 1;
      counts.set(g, counts.get(g) - 1);
    }
  }
  return (2 * common) / (ba.length + bb.length);
}

// Sites que não identificam um estabelecimento (redes sociais, portais, encurtadores).
const GENERIC_HOSTS = /(^|\.)(facebook|instagram|tripadvisor|booking|airbnb|expedia|hostelworld|google|goo|wa|linktr|linktree|youtube|twitter|x|tiktok|wixsite|business|blogspot|wordpress|weebly|godaddysites|carrd)\./i;

/** Domínio do site (sem www), ou null se inválido ou genérico demais para identificar o local. */
export function websiteDomain(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    if (!host.includes('.') || GENERIC_HOSTS.test(`${host}.`)) return null;
    return host;
  } catch {
    return null;
  }
}

/** Telefone só com dígitos; menos de 8 dígitos não identifica ninguém. */
export function phoneDigits(phone) {
  const d = String(phone ?? '').replace(/\D+/g, '');
  return d.length >= 8 ? d.slice(-9) : null; // últimos 9 dígitos ignoram prefixo de país
}
