// Integração OPCIONAL com OpenTripPlanner 2 (GTFS GraphQL API). Sem endpoint configurado, informa que
// o roteamento não está disponível e NÃO inventa itinerários. Não foi testada contra um servidor real.
import { createSourceMetadata } from './sourceMetadata.js';
import { createTravelOption, MODES, otpModeToMode } from './normalizers.js';
import { SEARCH_STATUS, searchResult } from './transportProvider.js';
import { parseLatLon } from '../geo.js';

const clock = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const PLAN_QUERY = `
query Plan($from: InputCoordinates!, $to: InputCoordinates!, $date: String, $time: String) {
  plan(from: $from, to: $to, date: $date, time: $time, numItineraries: 5) {
    itineraries {
      startTime
      endTime
      duration
      legs {
        mode
        startTime
        endTime
        from { name }
        to { name }
        route { shortName longName agency { name url } }
      }
    }
  }
}`;

/** Aceita "lat,lon"; nomes exigiriam geocodificação, que este provedor não faz. */
export const parseCoordinates = parseLatLon;

export function createOtpProvider({ baseUrl = '', fetchImpl = (...a) => fetch(...a), source = {} } = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const meta = createSourceMetadata({
    id: 'otp',
    name: 'OpenTripPlanner (serviço configurado)',
    url: base || 'https://www.opentripplanner.org/',
    notes: 'Licença e atribuição dos dados dependem dos conjuntos carregados no servidor.',
    ...source,
  });
  return {
    id: 'otp',
    name: 'Roteamento (OpenTripPlanner)',
    isConfigured: () => Boolean(base),
    describeCoverage: () => ({ modes: [], text: 'As modalidades dependem dos dados carregados no servidor de roteamento.' }),
    getSource: () => meta,
    async search({ origin, destination, date }) {
      const from = parseCoordinates(origin);
      const to = parseCoordinates(destination);
      if (!from || !to) {
        return searchResult(SEARCH_STATUS.EMPTY, {
          source: meta,
          message: 'O roteamento aceita origem e destino como coordenadas "lat,lon" (sem geocodificação nesta versão).',
        });
      }
      const res = await fetchImpl(`${base}/otp/gtfs/v1`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: PLAN_QUERY, variables: { from, to, date: date || undefined } }),
      });
      if (!res.ok) throw new Error(`o serviço respondeu ${res.status}`);
      const body = await res.json();
      if (body.errors?.length) throw new Error('resposta de erro do serviço de roteamento');
      const itineraries = body.data?.plan?.itineraries;
      if (!Array.isArray(itineraries)) throw new Error('resposta inesperada do serviço de roteamento');

      const options = itineraries.map((it, i) => {
        const transit = it.legs.filter((l) => otpModeToMode(l.mode) !== MODES.WALK);
        const modes = new Set(it.legs.map((l) => otpModeToMode(l.mode)));
        const agency = transit[0]?.route?.agency;
        return createTravelOption(
          {
            id: `otp:${i}`,
            origin: it.legs[0]?.from?.name ?? null,
            destination: it.legs.at(-1)?.to?.name ?? null,
            mode: modes.size > 1 ? MODES.MULTIMODAL : [...modes][0],
            legs: it.legs.map((l) => ({
              mode: otpModeToMode(l.mode),
              from: l.from?.name ?? null,
              to: l.to?.name ?? null,
              line: l.route?.shortName || l.route?.longName || null,
              operator: l.route?.agency?.name ?? null,
            })),
            departure: Number.isFinite(it.startTime) ? Math.round(it.startTime / 1000) : null,
            arrival: Number.isFinite(it.endTime) ? Math.round(it.endTime / 1000) : null,
            departureText: Number.isFinite(it.startTime) ? clock(it.startTime) : null,
            arrivalText: Number.isFinite(it.endTime) ? clock(it.endTime) : null,
            durationSeconds: Number.isFinite(it.duration) ? it.duration : null,
            price: null, // OTP não fornece tarifa sem dados de fare configurados: não presumimos
            operator: agency?.name ?? null,
            lineName: transit[0]?.route?.shortName ?? null,
            url: agency?.url ?? null,
            estimated: true,
          },
          meta,
        );
      });
      return searchResult(options.length ? SEARCH_STATUS.OK : SEARCH_STATUS.EMPTY, {
        options,
        source: meta,
        message: options.length ? null : 'Nenhuma rota encontrada pelo serviço.',
      });
    },
  };
}
