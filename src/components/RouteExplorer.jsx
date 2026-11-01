import { useState } from 'react';
import { ArrowUpRight, Bus, Plane } from 'lucide-react';
import { fetchFlights } from '../api/flights.js';
import { fetchOsmCampings } from '../services/lodging/osmCamping.js';
import { dedupeLodgings } from '../services/lodging/lodgingModel.js';
import { buildRouteOptions, OPTION_KIND } from '../services/routes/routeOptions.js';
import { CITIES, findCity } from '../data/airports.js';
import { searchGroups, searchUrl } from '../data/searchSites.js';
import { partners } from '../data/partners.js';

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MODE_ICON = { plane: Plane, bus: Bus };
const KIND_NAME = { hotel: 'Hotel', motel: 'Motel', guest_house: 'Pousada', hostel: 'Hostel' };
const SHOW_FIRST = 3;

function Modes({ modes }) {
  return (
    <span className="route-modes" aria-hidden="true">
      {modes.map((m) => {
        const Icon = MODE_ICON[m] ?? Bus;
        return <Icon key={m} size={18} />;
      })}
    </span>
  );
}

function GroundLinks({ option, origin, destination }) {
  const omio = partners.find((p) => p.id === 'bus' && p.url.startsWith('https://'));
  const query = `${origin.city} ${destination.city}`;
  const sites = option.sameCountry ? searchGroups.find((g) => g.id === 'bus').sites : [{ name: 'Omio', domain: 'omio.com.br' }, { name: 'Rome2Rio', domain: 'rome2rio.com' }];
  return (
    <div className="route-links">
      {omio && (
        <a className="btn-primary" href={omio.url} target="_blank" rel="noopener noreferrer sponsored">
          Ver no {omio.name} <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      )}
      {sites.map((s) => (
        <a key={s.domain} className="btn-outline" href={searchUrl(s.domain, query)} target="_blank" rel="noopener noreferrer">
          {s.name} <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function OptionRow({ option, origin, destination }) {
  const isFlight = option.kind === OPTION_KIND.FLIGHT;
  const body = (
    <>
      <div className="route-main">
        <b>{option.title}</b>
        <Modes modes={option.modes} />
        {option.best && <em className="route-best">MELHOR PREÇO</em>}
        <p>
          {option.detail}
          {option.date ? ` · ida ${new Date(option.date).toLocaleDateString('pt-BR')}` : ''}
        </p>
        {option.source && <small>Fonte: {option.source}</small>}
      </div>
      <div className="route-price">
        {option.price !== null ? (
          <>
            <b>{brl(option.price)}</b>
            {option.perPerson && <small>{brl(option.perPerson)} por pessoa</small>}
          </>
        ) : (
          <small>preço indisponível</small>
        )}
        {isFlight && <ArrowUpRight size={16} aria-hidden="true" />}
      </div>
    </>
  );
  if (isFlight) {
    return (
      <li className="route-option">
        <a href={option.url} target="_blank" rel="noopener noreferrer sponsored" className="route-link">{body}</a>
      </li>
    );
  }
  return (
    <li className="route-option">
      <div className="route-link">{body}</div>
      <GroundLinks option={option} origin={origin} destination={destination} />
    </li>
  );
}

/** "De A para B": voos com preço de fonte real, trecho terrestre com atalhos e hotéis do destino. */
export function RouteExplorer({ onNavigate }) {
  const [form, setForm] = useState({ origin: '', destination: '', month: '', adults: '1' });
  const [state, setState] = useState({ status: 'idle', error: '', options: [], origin: null, destination: null, approximate: false });
  const [hotels, setHotels] = useState({ status: 'idle', records: [], message: '' });
  const [showAll, setShowAll] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const origin = findCity(form.origin);
    const destination = findCity(form.destination);
    if (!origin || !destination) {
      setState({ status: 'error', error: 'Escolha origem e destino da lista de cidades.', options: [], origin: null, destination: null, approximate: false });
      return;
    }
    if (origin.iata === destination.iata) {
      setState({ status: 'error', error: 'Origem e destino precisam ser diferentes.', options: [], origin: null, destination: null, approximate: false });
      return;
    }
    setShowAll(false);
    setHotels({ status: 'loading', records: [], message: '' });
    setState({ status: 'loading', error: '', options: [], origin, destination, approximate: false });
    fetchOsmCampings(destination.osm, { category: 'hotel' }).then((r) => setHotels({ status: r.status, records: dedupeLodgings(r.records ?? []), message: r.message ?? '' }));
    try {
      const data = await fetchFlights({ origin: origin.iata, destination: destination.iata, oneWay: true, month: form.month || undefined, adults: Number(form.adults) });
      setState({ status: 'done', error: '', origin, destination, approximate: Boolean(data.approximate), options: buildRouteOptions({ origin, destination, flights: data.flights ?? [] }) });
    } catch (err) {
      // Voos indisponíveis não escondem o resto: o trecho terrestre e os hotéis continuam.
      setState({ status: 'done', error: `Voos indisponíveis agora: ${err.message}`, origin, destination, approximate: false, options: buildRouteOptions({ origin, destination, flights: [] }) });
    }
  };

  const { options, origin, destination } = state;
  const visible = showAll ? options : options.slice(0, SHOW_FIRST);
  const flightCount = options.filter((o) => o.kind === OPTION_KIND.FLIGHT).length;

  return (
    <section className="route-explorer">
      <form onSubmit={submit} className="flights-form">
        <label>
          De
          <input list="route-cities" value={form.origin} onChange={set('origin')} placeholder="São Paulo" required />
        </label>
        <label>
          Para
          <input list="route-cities" value={form.destination} onChange={set('destination')} placeholder="Lisboa" required />
        </label>
        <label>
          Mês da viagem (opcional)
          <input type="month" value={form.month} onChange={set('month')} />
        </label>
        <label>
          Passageiros
          <select value={form.adults} onChange={set('adults')}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button className="btn-primary" type="submit" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Buscando…' : 'Ver maneiras de ir'}
        </button>
        <datalist id="route-cities">{CITIES.map((c) => <option key={c.iata} value={c.label} />)}</datalist>
      </form>

      {state.status === 'error' && <p role="alert">{state.error}</p>}
      {state.status === 'done' && (
        <div className="route-card">
          <h2>{options.length} {options.length === 1 ? 'maneira' : 'maneiras'} de ir de {origin.city} para {destination.city}</h2>
          {state.error && <p role="status">{state.error}</p>}
          {state.approximate && <p role="status">Sem preço guardado para o mês exato; mostrando os mais baratos de datas próximas.</p>}
          {flightCount === 0 && !state.error && <p role="status">Nenhum preço de voo guardado para essa rota.</p>}
          <ul className="route-list">
            {visible.map((o) => <OptionRow key={o.id} option={o} origin={origin} destination={destination} />)}
          </ul>
          {options.length > SHOW_FIRST && !showAll && (
            <button className="btn-outline route-more" onClick={() => setShowAll(true)}>Mostrar mais {options.length - SHOW_FIRST} {options.length - SHOW_FIRST === 1 ? 'opção' : 'opções'}</button>
          )}
          <p className="flights-note">Só mostramos preço de fonte real, com link. Duração e preço de ônibus e trem aparecem quando houver fonte; hoje não há.</p>
        </div>
      )}

      {state.status === 'done' && (
        <div className="route-card">
          <h2>Hotéis em {destination.city}</h2>
          {hotels.status === 'loading' && <p role="status">Consultando o OpenStreetMap…</p>}
          {(hotels.status === 'unavailable' || hotels.status === 'empty') && <p role="status">{hotels.message}</p>}
          {hotels.status === 'ok' && (
            <ul className="route-hotels">
              {hotels.records.slice(0, 6).map((h) => (
                <li key={h.id}>
                  <b>{h.name ?? 'Local sem nome'}</b>
                  <small>{KIND_NAME[h.kind] ?? 'Hospedagem'}{h.stars ? ` · ${h.stars}★` : ''}</small>
                  <small>preço não informado</small>
                </li>
              ))}
            </ul>
          )}
          <p className="flights-note">
            Dados © OpenStreetMap contributors (ODbL). O mapa não traz preço, foto nem nota.{' '}
            <button className="back-link" onClick={() => onNavigate('Hospedagem')}>Ver todos e filtrar →</button>
          </p>
        </div>
      )}
    </section>
  );
}
