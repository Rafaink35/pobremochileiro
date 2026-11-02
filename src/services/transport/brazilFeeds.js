// Feeds GTFS brasileiros (Rio, SPTrans, ANTT). O app NÃO embute dados: baixa o ZIP pelo proxy /api/gtfs, que só
// funciona se o dono do projeto configurar a URL do feed no servidor. Licença e uso comercial ficam "não verificados"
// até alguém confirmar na fonte oficial, e a tela Fontes de dados mostra essas pendências.
import { COMMERCIAL_USE } from './sourceMetadata.js';

export const BRAZIL_FEEDS = [
  {
    id: 'rio',
    label: 'Rio de Janeiro (ônibus, SMTR)',
    meta: {
      name: 'GTFS dos ônibus do Rio de Janeiro (SMTR / data.rio)',
      url: 'https://dados.mobilidade.rio/',
      coverage: 'Município do Rio de Janeiro (ônibus)',
    },
  },
  {
    id: 'sptrans',
    label: 'São Paulo (SPTrans)',
    meta: {
      name: 'SPTrans GTFS (São Paulo)',
      url: 'https://www.sptrans.com.br/desenvolvedores/',
      coverage: 'Município de São Paulo (ônibus)',
    },
  },
  {
    id: 'antt',
    label: 'Rodoviário interestadual (ANTT)',
    meta: {
      name: 'ANTT: horários do transporte rodoviário interestadual',
      url: 'https://dados.antt.gov.br/',
      coverage: 'Linhas rodoviárias interestaduais e internacionais regulamentadas pela ANTT',
    },
  },
];

const byId = (id) => BRAZIL_FEEDS.find((f) => f.id === id);

/**
 * Baixa e importa um feed. Nunca lança: devolve { ok, message, report }.
 * `provider` é o gtfsProvider; `fetchImpl` permite testar sem rede.
 */
export async function loadBrazilFeed(id, provider, { fetchImpl = fetch, base = '/api/gtfs' } = {}) {
  const feed = byId(id);
  if (!feed) return { ok: false, message: 'Feed desconhecido.', report: null };
  let res;
  try {
    res = await fetchImpl(`${base}?feed=${encodeURIComponent(id)}`);
  } catch {
    return { ok: false, message: 'Sem conexão com o servidor de dados.', report: null };
  }
  if (res.status === 503) {
    return { ok: false, message: `${feed.label}: fonte ainda não configurada neste servidor. Nenhum dado é mostrado.`, report: null };
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).error ?? '';
    } catch {
      // corpo não era JSON
    }
    return { ok: false, message: `${feed.label}: falha ao baixar${detail ? ` (${detail})` : ''}.`, report: null };
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const report = provider.importZip(bytes, {
    ...feed.meta,
    id: `br-${feed.id}`,
    commercialUse: COMMERCIAL_USE.UNVERIFIED,
  });
  if (!report.dataset) return { ok: false, message: `${feed.label}: ${report.errors.join(' ')}`, report };
  const c = report.dataset.counts;
  return {
    ok: true,
    message: `${feed.label}: ${c.stops} paradas, ${c.routes} linhas, ${c.trips} viagens${report.duplicate ? ' (já carregado)' : ''}.`,
    report,
  };
}
