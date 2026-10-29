import { useState } from 'react';
import { ArrowUpRight, Route } from 'lucide-react';
import { providerRegistry } from '../services/transport/providerRegistry.js';
import { attributionText } from '../services/transport/sourceMetadata.js';
import { formatDuration } from '../services/transport/normalizers.js';
import { describeProviderState, priceLabel, VIEW_STATE } from '../services/transport/viewState.js';
import { GtfsImport } from './GtfsImport.jsx';

const MODE_LABEL = { bus: 'Ônibus', train: 'Trem', subway: 'Metrô/VLT', ferry: 'Balsa', walk: 'A pé', multimodal: 'Combinação', other: 'Outro' };

function OptionCard({ option }) {
  const src = option.source;
  return (
    <li className="transport-option">
      <div className="transport-head">
        <b>{MODE_LABEL[option.mode] ?? 'Outro'}</b>
        {option.lineName && <span>Linha {option.lineName}</span>}
        {option.operator && <span>{option.operator}</span>}
        {option.estimated && <em>estimado</em>}
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

export function TransportSearch() {
  const [form, setForm] = useState({ origin: '', destination: '', date: '' });
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
          <input value={form.destination} onChange={set('destination')} required />
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
      <GtfsImport />
    </section>
  );
}
