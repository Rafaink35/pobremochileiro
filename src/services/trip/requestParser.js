// Interpretador de pedidos em português SEM LLM: regras e padrões de texto.
// Entende só o que as regras abaixo cobrem (orçamento, origem, duração, preferências, carro, pessoas). Quando falta algo
// ou há ambiguidade, devolve perguntas de esclarecimento em vez de adivinhar. Não é um entendimento de frase livre.
//
// Interface de interpretadores (um LLM local pode implementá-la no futuro, sem mudar a interface do app):
//   interpret(text: string, options?: { knownPlaces?: Array<{ name, aliases }> }) => Promise<InterpretResult>
//   InterpretResult = { complete, params, clarifications: [{ field, question }], assumptions: string[], evidence: {} }
import { normKey } from './knowledge.js';

const NUMBER_WORDS = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, vinte: 20, trinta: 30,
};

// Cidades que o interpretador reconhece sem consultar a base (nome canônico, apelidos em forma normalizada).
const DEFAULT_PLACES = [
  ['Rio de Janeiro', ['rio de janeiro', 'rio', 'rj', 'cidade maravilhosa']],
  ['São Paulo', ['sao paulo', 'sp', 'sampa']],
  ['Belo Horizonte', ['belo horizonte', 'bh']],
  ['Curitiba', ['curitiba']],
  ['Porto Alegre', ['porto alegre', 'poa']],
  ['Brasília', ['brasilia', 'df']],
  ['Salvador', ['salvador']],
  ['Recife', ['recife']],
  ['Fortaleza', ['fortaleza']],
  ['Florianópolis', ['florianopolis', 'floripa']],
  ['Goiânia', ['goiania']],
  ['Vitória', ['vitoria']],
  ['Campinas', ['campinas']],
];

export const PREFERENCE_PATTERNS = [
  ['natureza', /\b(natureza|trilhas?|cachoeiras?|parques?|ecoturismo|mata)\b/],
  ['praia', /\b(praias?|mar|litoral)\b/],
  ['cidade', /\b(cidades?|urbano|museus?)\b/],
  ['cultura', /\b(cultura|historia|historico)\b/],
  ['camping', /\b(camping|campings|acampar|barraca)\b/],
  ['work exchange', /\b(work ?exchange|trabalho em troca|voluntariado|voluntariar)\b/],
  ['aventura', /\b(aventura|rapel|rafting)\b/],
];

const numberFrom = (token) => {
  if (/^\d+$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
};
const numPattern = '(\\d+|' + Object.keys(NUMBER_WORDS).join('|') + ')';

/** "1.500,50" -> 1500.5 ; "600" -> 600 */
const brNumber = (s) => {
  let t = s.trim();
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function findBudgets(text) {
  const found = [];
  // R$ 600 | R$ 1.500,50 | R$ 3 mil
  for (const m of text.matchAll(/r\$\s*(\d[\d.,]*)(\s*mil\b)?/g)) {
    const n = brNumber(m[1].replace(/[.,]$/, ''));
    if (n !== null) found.push({ value: m[2] ? n * 1000 : n, text: m[0].trim() });
  }
  // 600 reais | 1.500 conto(s) | 3 mil reais
  for (const m of text.matchAll(/(?<![\d$])(\d[\d.,]*)(\s*mil)?\s*(reais|real|contos?|pilas?)\b/g)) {
    const n = brNumber(m[1].replace(/[.,]$/, ''));
    if (n !== null) found.push({ value: m[2] ? n * 1000 : n, text: m[0].trim() });
  }
  // dois mil reais | mil reais
  for (const m of text.matchAll(new RegExp(`(?:\\b${numPattern}\\s+)?mil\\s+(?:reais|real|contos?)\\b`, 'g'))) {
    const mult = m[1] ? numberFrom(m[1]) : 1;
    if (mult) found.push({ value: mult * 1000, text: m[0].trim() });
  }
  // Mesma quantia achada por dois padrões conta uma vez.
  const values = [...new Set(found.map((f) => f.value))];
  return { values, evidence: found.map((f) => f.text) };
}

function findDurations(text) {
  const days = [];
  const evidence = [];
  for (const m of text.matchAll(new RegExp(`\\b${numPattern}\\s+(?:dias?|diarias?)\\b`, 'g'))) {
    const n = numberFrom(m[1]);
    if (n) { days.push(n); evidence.push(m[0]); }
  }
  for (const m of text.matchAll(new RegExp(`\\b${numPattern}\\s+noites?\\b`, 'g'))) {
    const n = numberFrom(m[1]);
    if (n) { days.push(n + 1); evidence.push(`${m[0]} (= ${n + 1} dias)`); }
  }
  for (const m of text.matchAll(new RegExp(`\\b${numPattern}\\s+semanas?\\b`, 'g'))) {
    const n = numberFrom(m[1]);
    if (n) { days.push(n * 7); evidence.push(m[0]); }
  }
  const vague = /\b(fim|final) de semana\b|\bfds\b|\bferiado\b|\balguns dias\b/.test(text);
  return { values: [...new Set(days)], evidence, vague };
}

function resolvePlace(raw, places) {
  const key = normKey(raw);
  for (const p of places) if (p.aliases.includes(key)) return p.name;
  return null;
}

function findOrigin(text, places) {
  // "saio do Rio", "saindo de São Paulo", "partindo de Curitiba", "parto de BH", "venho de Salvador", "moro em ..."
  const re = /\b(?:sai(?:o|ndo|r)|saimos|parto|partindo|vou sair|venho|vindo|moro)\s+(?:do|da|de|em|no|na)\s+([a-z][a-z -]{1,40}?)(?=\s*(?:,|\.|;|\d|$)|\s+(?:e|ou|mas|quero|tenho|nao|com|por|para|durante|ate)\b)/g;
  const origins = [];
  for (const m of text.matchAll(re)) {
    origins.push({ raw: m[1].trim(), text: m[0].trim() });
    // Segunda origem na mesma frase: "saio do Rio e de São Paulo", "... ou de Curitiba".
    const rest = text.slice(m.index + m[0].length);
    for (const extra of rest.matchAll(/^\s*(?:e|ou)\s+(?:do|da|de|em)\s+([a-z][a-z -]{1,40}?)(?=\s*(?:,|\.|;|\d|$)|\s+(?:e|ou|mas|quero|tenho|nao|com|por|para)\b)/g)) {
      origins.push({ raw: extra[1].trim(), text: extra[0].trim() });
    }
  }
  return origins.map((o) => ({ ...o, place: resolvePlace(o.raw, places) }));
}

/** Interpretador por regras. `knownPlaces`: cidades extras ([{ name, aliases }]), por exemplo as origens da base. */
export function parseTripRequest(input, { knownPlaces = [] } = {}) {
  const original = String(input ?? '');
  const text = normKey(original).length ? original.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '') : '';
  const places = [
    ...DEFAULT_PLACES.map(([name, aliases]) => ({ name, aliases })),
    ...knownPlaces.map((p) => ({ name: p.name, aliases: [...new Set([normKey(p.name), ...[...(p.aliases ?? [])].map(normKey)])] })),
  ];
  const clarifications = [];
  const assumptions = [];
  const evidence = {};
  const params = { budget: null, origin: null, days: null, preferences: [], hasCar: null, people: null };

  if (!text.trim()) {
    return { complete: false, params, clarifications: [{ field: 'request', question: 'Escreva o que você procura: quanto tem, de onde sai e quantos dias.' }], assumptions, evidence };
  }

  // Orçamento
  const b = findBudgets(text);
  if (b.values.length === 1) {
    params.budget = b.values[0];
    evidence.budget = b.evidence[0].replace(/[,.]$/, "");
  } else if (b.values.length > 1) {
    clarifications.push({ field: 'budget', question: `Encontrei mais de um valor (${b.values.map((v) => `R$ ${v}`).join(' e ')}). Qual é o seu orçamento total?` });
  } else {
    clarifications.push({ field: 'budget', question: 'Quanto você pode gastar no total, em reais?' });
  }

  // Origem
  const o = findOrigin(text, places);
  const resolved = [...new Set(o.filter((x) => x.place).map((x) => x.place))];
  if (resolved.length === 1) {
    params.origin = resolved[0];
    evidence.origin = o.find((x) => x.place).text;
    if (normKey(o.find((x) => x.place).raw) === 'rio') assumptions.push('"Rio" interpretado como Rio de Janeiro.');
  } else if (resolved.length > 1) {
    clarifications.push({ field: 'origin', question: `De qual cidade você sai: ${resolved.join(' ou ')}?` });
  } else if (o.length) {
    clarifications.push({ field: 'origin', question: `Não reconheci a origem "${o[0].raw}". Pode escrever o nome da cidade?` });
  } else {
    clarifications.push({ field: 'origin', question: 'De que cidade você sai?' });
  }

  // Duração
  const d = findDurations(text);
  if (d.values.length === 1) {
    params.days = d.values[0];
    evidence.days = d.evidence[0];
  } else if (d.values.length > 1) {
    clarifications.push({ field: 'days', question: `Encontrei mais de uma duração (${d.values.join(' e ')} dias). Quantos dias dura a viagem?` });
  } else {
    clarifications.push({ field: 'days', question: d.vague ? 'Quantos dias exatamente? "Fim de semana" ou "feriado" pode ter 2, 3 ou 4 dias.' : 'Quantos dias de viagem?' });
  }

  // Preferências
  for (const [name, re] of PREFERENCE_PATTERNS) if (re.test(text)) params.preferences.push(name);

  // Carro
  if (/\b(nao tenho carro|sem carro|nao tenho veiculo|nao dirijo|nao tenho moto ou carro)\b/.test(text)) params.hasCar = false;
  else if (/\b(tenho carro|de carro|vou de carro|com carro|tenho um carro)\b/.test(text)) params.hasCar = true;
  if (params.hasCar === null) assumptions.push('Não informou se tem carro: o carro não será considerado.');

  // Pessoas
  if (/\b(sozinho|sozinha|so eu)\b/.test(text)) params.people = 1;
  else if (/\b(casal|eu e (?:meu|minha) \w+|em dupla)\b/.test(text)) params.people = 2;
  else {
    const m = text.match(new RegExp(`\\b(?:em|para|somos)\\s+${numPattern}\\s+(?:pessoas|amigos|amigas)\\b`));
    if (m && numberFrom(m[1])) params.people = numberFrom(m[1]);
  }
  if (params.people === null) {
    params.people = 1;
    assumptions.push('Número de pessoas não informado: considerando 1.');
  }

  const complete = clarifications.length === 0;
  return { complete, params, clarifications, assumptions, evidence };
}

/** Interpretador por regras na interface assíncrona (compatível com um futuro LLM local). */
export function createRuleInterpreter(options = {}) {
  return {
    name: 'rules-pt-br',
    understandsFreeText: false, // só cobre os padrões acima
    interpret: async (text, extra = {}) => parseTripRequest(text, { ...options, ...extra }),
  };
}

export function assertInterpreter(i) {
  if (!i || typeof i.interpret !== 'function' || typeof i.name !== 'string') throw new Error('Interpretador inválido: precisa de name e interpret(text).');
  return i;
}
