import { useState } from 'react';
import { ArrowUpRight, Route } from 'lucide-react';
import { providerRegistry } from '../services/transport/providerRegistry.js';
import { attributionText } from '../services/transport/sourceMetadata.js';
import { formatDuration } from '../services/transport/normalizers.js';
import { describeProviderState, priceLabel, VIEW_STATE } from '../services/transport/viewState.js';
import { GtfsImport } from './GtfsImport.jsx';
import { externalMapLinks, validateCoordinates } from '../services/geo.js';

const MODE_LABEL = { bus: 'Ônibus', train: 'Trem', subway: 'Metrô/VLT', ferry: 'Balsa', walk: 'A pé', multimodal: 'Combinação', other: 'Outro' };

function OptionCard({ option }) {
  const src = option.source;
  return (
    <li className="transport-option">
      <div className="transport-head">
        <b>{MODE_LABEL[option.mode] ?? 'Outro'}</b>
        {option.lineName && <span>Linha {option.lineName}</span>}
        {option.operator && <span>{option.operator}</span>}
        <em>{option.estimated ? 'estimativa' : 'horário programado'}</em>
        {option.incomplete && <em>dados incompletos</em>}
      </div>
      <p>
        {option.origin ?? '—'} → {option.destination ?? '—'}
      </p>
      <p>
        {option.departureText ? `Parte ${option.departureText}` : 'Horário de partida não disponível'}
        {option.arrivalText ? ` · chega ${option.arrivalText}` : ''}
        {' · '}
        {formatDuration(option.durationSeconds) ?? 'duração não disponível'}
      </p>
      <p>
        <b>{priceLabel(option.price)}</b>
      </p>
      {src && <small>Fonte: {attributionText(src)}</small>}
      {option.url && (
        <a href={option.url} target="_blank" rel="noopener noreferrer">
          Site do operador <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

/**
 * `destination` (opcional): { name, lat, lon } de um local real. As coordenadas preenchem o destino.
 * Sem provedor configurado ou sem rota validada, oferece abrir o destino num mapa externo.
 */
export function TransportSearch({ destination = null }) {
  const coords = destination ? validateCoordinates(destination.lat, destination.lon) : null;
  const [form, setForm] = useState({
    origin: '',
    destination: coords ? `${coords.lat},${coords.lon}` : '',
    date: '',
  });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const coverage = Object.fromEntries(
    providerRegistry.list().filter((p) => p.describeCoverage).map((p) => [p.id, p.describeCoverage().text]),
  );
  const links = coords ? externalMapLinks(coords.lat, coords.lon) : null;
  const allNotConfigured = results?.every((r) => r.status === 'not_configured');
  const hasRoutes = results?.some((r) => r.options.length > 0);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResults(null);
    try {
      setResults(await providerRegistry.searchAll(form));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="transport-search">
      <h3>
        <Route size={18} aria-hidden="true" /> Como chegar
      </h3>
      {destination && !coords && (
        <p role="alert">As coordenadas deste local são inválidas, então não é possível pesquisar rotas até ele.</p>
      )}
      {destination && coords && <p>Destino: <b>{destination.name}</b> ({coords.lat}, {coords.lon})</p>}
      <p className="flights-note">
        Pesquisa nas fontes de dados configuradas. Sem fonte configurada, nada é mostrado: não há rotas de exemplo.
      </p>
      <form onSubmit={submit} className="flights-form">
        <label>
          Origem (nome da parada ou lat,lon)
          <input value={form.origin} onChange={set('origin')} required />
        </label>
        <label>
          Destino (nome da parada ou lat,lon)
          <input value={form.destination} onChange={set('destination')} required readOnly={Boolean(coords)} />
        </label>
        <label>
          Data
          <input type="date" value={form.date} onChange={set('date')} />
        </label>
        <button className="btn-outline" type="submit" disabled={loading}>
          {loading ? 'Procurando…' : 'Procurar'}
        </button>
      </form>
      {loading && <p role="status">{describeProviderState(null).text}</p>}
      {results &&
        results.map((r) => {
          const view = describeProviderState(r);
          return (
            <div key={r.providerId} className="transport-provider">
              <h4>{r.providerName}</h4>
              {coverage[r.providerId] && <small>{coverage[r.providerId]}</small>}
              {view.state !== VIEW_STATE.RESULTS && <p role="status">{view.text}</p>}
              {r.options.length > 0 && (
                <ul className="transport-list">
                  {r.options.map((o) => (
                    <OptionCard key={o.id} option={o} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      {results && allNotConfigured && <p role="status"><b>Roteamento ainda não configurado.</b> Nenhuma fonte de transporte está ativa.</p>}
      {links && results && !hasRoutes && (
        <p role="status">Sem rota validada pelo app para este destino.</p>
      )}
      {links && (
        <p className="flights-note">
          Abrir o destino em um serviço externo (o Pobre Mochileiro não validou nenhuma rota por lá):{' '}
          <a href={links.openStreetMap} target="_blank" rel="noopener noreferrer">OpenStreetMap</a>
          {' · '}
          <a href={links.googleMaps} target="_blank" rel="noopener noreferrer">Google Maps</a>
        </p>
      )}
      <GtfsImport />
    </section>
  );
}
