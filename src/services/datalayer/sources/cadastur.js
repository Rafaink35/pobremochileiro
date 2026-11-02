// Importador do Cadastur (Ministério do Turismo, dados.turismo.gov.br: "meios de hospedagem").
// ATENÇÃO: o formato real (colunas, separador, periodicidade, licença) NÃO foi validado, porque o portal não abriu
// durante o desenvolvimento. Por isso o mapeamento é por nome de coluna conhecido (aliases) e, se as colunas
// essenciais não forem reconhecidas, a importação PARA com a lista de colunas encontradas, em vez de adivinhar.
// Não há API presumida: lê um CSV (arquivo ou URL configurada pelo dono do projeto).
import { createEstablishment } from '../model.js';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** CSV com delimitador detectado (; , ou tab; arquivos brasileiros costumam usar ;) e aspas. Devolve linhas (listas). */
export function parseDelimited(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', '\t', ','].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.some((v) => v.trim() !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      endRow();
    } else field += c;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

const ALIASES = {
  name: ['nome fantasia', 'nome', 'razao social', 'estabelecimento'],
  category: ['atividade', 'tipo', 'categoria', 'segmento', 'classificacao', 'subtipo'],
  city: ['municipio', 'cidade', 'nome municipio'],
  state: ['uf', 'estado', 'sigla uf'],
  address: ['endereco', 'logradouro'],
  phone: ['telefone', 'fone', 'telefone 1'],
  website: ['site', 'website', 'url', 'pagina web'],
  situation: ['situacao', 'situacao cadastral', 'status'],
  id: ['cnpj', 'codigo', 'id', 'numero cadastro', 'numero do certificado'],
};
const REQUIRED = ['name', 'category', 'state'];

export const CADASTUR_SOURCE = Object.freeze({
  provider: 'cadastur',
  name: 'Cadastur (Ministério do Turismo): meios de hospedagem',
  url: 'https://dados.turismo.gov.br/pt_BR/dataset/meios-de-hospedagem',
  license: 'a confirmar na página do conjunto',
  attribution: 'Ministério do Turismo / Cadastur',
});

/** Tipo do Pobre Mochileiro a partir do texto de categoria do Cadastur; categoria sem equivalente não é importada. */
export function mapCategory(raw) {
  const t = norm(raw);
  if (!t) return null;
  if (t.includes('hostel') || t.includes('albergue')) return 'hostel';
  if (t.includes('pousada')) return 'pousada';
  if (t.includes('camping') || t.includes('acampamento')) return 'camping';
  if (t.includes('hotel')) return 'hotel';
  return null;
}

/** Descobre quais colunas do arquivo correspondem a cada campo. */
export function mapColumns(headers) {
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const map = {};
  for (const [field, aliases] of Object.entries(ALIASES)) {
    const hit = aliases.find((a) => byNorm.has(a));
    if (hit) map[field] = byNorm.get(hit);
  }
  return map;
}

/**
 * CSV (texto) → { records, rejected, errors }. `referenceDate` é a data de referência da base importada.
 * Coordenadas ficam null: o Cadastur não as traz; a localização é só município/UF.
 */
export function normalizeCadasturCsv(csvText, { referenceDate, sourceUrl = CADASTUR_SOURCE.url, license = CADASTUR_SOURCE.license, collectedAt = new Date().toISOString() } = {}) {
  const rows = parseDelimited(csvText ?? '');
  if (rows.length < 2) return { records: [], rejected: [], errors: ['arquivo vazio ou sem linhas de dados'] };
  const headers = rows[0];
  const cols = mapColumns(headers);
  const missing = REQUIRED.filter((f) => !cols[f]);
  if (missing.length) {
    return { records: [], rejected: [], errors: [`formato não reconhecido: faltam colunas para ${missing.join(', ')}. Colunas encontradas: ${headers.slice(0, 30).join(' | ')}`] };
  }
  const idx = Object.fromEntries(Object.entries(cols).map(([f, h]) => [f, headers.indexOf(h)]));
  const get = (row, f) => (idx[f] >= 0 ? row[idx[f]] : undefined);
  const records = [];
  const rejected = [];
  rows.slice(1).forEach((row, i) => {
    if (row.every((c) => !String(c).trim())) return;
    const type = mapCategory(get(row, 'category'));
    if (!type) {
      rejected.push({ id: `linha ${i + 2}`, reason: `categoria sem equivalente: ${String(get(row, 'category') ?? '').slice(0, 60)}` });
      return;
    }
    const nameVal = get(row, 'name');
    const sourceId = String(get(row, 'id') ?? '').trim() || `${norm(nameVal)}|${norm(get(row, 'city'))}|${String(get(row, 'state') ?? '').trim().toUpperCase()}`;
    const { value, problems } = createEstablishment({
      name: nameVal, type, address: get(row, 'address'), city: get(row, 'city'), state: get(row, 'state'),
      phone: get(row, 'phone'), website: /^https?:\/\//i.test(String(get(row, 'website') ?? '')) ? get(row, 'website') : null,
      source: 'cadastur', source_id: sourceId, source_url: sourceUrl, license, attribution: CADASTUR_SOURCE.attribution,
      last_verified_at: referenceDate ?? null, // data de referência da base: é quando o cadastro foi publicado
      status: 'unverified', // situação cadastral guardada em `extra`; "ativo" só se a fonte afirmar de forma inequívoca
      extra: { situacao_cadastral: get(row, 'situation') ? String(get(row, 'situation')).slice(0, 60) : null, categoria_original: String(get(row, 'category') ?? '').slice(0, 80) },
      last_synced_at: collectedAt,
    });
    if (value) records.push(value);
    else rejected.push({ id: `linha ${i + 2}`, reason: problems.join('; ') });
  });
  return { records, rejected, errors: [] };
}

/** Adaptador com o mesmo contrato do OSM (fetch/normalize/validate), lendo CSV de texto fornecido ou de URL configurada. */
export function createCadasturAdapter({ csvUrl = null, readText = null, fetchImpl = (...a) => fetch(...a), referenceDate = null, now = () => new Date() } = {}) {
  return {
    id: 'cadastur',
    name: CADASTUR_SOURCE.name,
    originKind: 'open',
    getSource: () => ({ ...CADASTUR_SOURCE, url: csvUrl ?? CADASTUR_SOURCE.url }),
    isConfigured: () => Boolean(csvUrl || readText),
    expandScope: (s) => [s],
    async fetch() {
      if (readText) return { elements: await readText(), fromCache: false };
      if (!csvUrl || !/^https:\/\//.test(csvUrl)) throw new Error('CADASTUR_CSV_URL não configurada (https)');
      const res = await fetchImpl(csvUrl);
      if (!res.ok) throw Object.assign(new Error(`Cadastur respondeu ${res.status}`), { status: res.status });
      return { elements: await res.text(), fromCache: false };
    },
    normalize(csvText, _scope, collectedAt = now().toISOString()) {
      const out = normalizeCadasturCsv(csvText, { referenceDate, collectedAt });
      if (out.errors.length) throw new Error(out.errors[0]);
      return out;
    },
    validate: (records) => ({ valid: records, rejected: 0 }),
  };
}
