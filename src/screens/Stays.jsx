import { useEffect, useState } from 'react';
import { Tent } from 'lucide-react';
import { fetchOsmCampings } from '../services/lodging/osmCamping.js';
import { dedupeLodgings, filterLodgings } from '../services/lodging/lodgingModel.js';
import { filterOpportunities } from '../services/workExchange/opportunity.js';
import { fetchApprovedOpportunities } from '../api/workExchange.js';
import { addStay, buildStayEntry } from '../services/planner/stays.js';
import { PlaceDetail } from '../components/PlaceDetail.jsx';
import { hasBackend } from '../api/supabase.js';
import { activePlanName } from '../services/planner/plans.js';
import { partners } from '../data/partners.js';
import { searchGroups, searchUrl } from '../data/searchSites.js';

const TABS = [['hotel', 'Hotéis'], ['hostel', 'Hostels'], ['camping', 'Campings'], ['work', 'Trabalho em troca'], ['aupair', 'Au pair']];
const OSM_TABS = ['hotel', 'hostel', 'camping'];
const SEARCH_LABEL = { hotel: 'Procurar hotéis', hostel: 'Procurar hostels', camping: 'Procurar campings' };
const NOUN = { hotel: 'hotéis e pousadas', hostel: 'hostels', camping: 'campings' };
const KIND_NAME = { camp_site: 'camping', caravan_site: 'área de motorhome', hotel: 'hotel', motel: 'motel', guest_house: 'pousada', hostel: 'hostel' };

const AMENITY_FILTERS = [
  ['toilets', 'Banheiro'],
  ['shower', 'Chuveiro'],
  ['kitchen', 'Cozinha'],
  ['drinkingWater', 'Água'],
  ['power', 'Energia'],
];
const COMFORT_FILTERS = [
  ['wifi', 'Wi-Fi'],
  ['kitchen', 'Cozinha'],
];

export function Stays({ draft, setDraft, notify, onNavigate }) {
  const [tab, setTab] = useState('hotel');
  const [place, setPlace] = useState('');
  const [search, setSearch] = useState({ status: 'idle', records: [], message: '', collectedAt: null });
  const [filters, setFilters] = useState({ kind: 'all', state: '', city: '', amenities: {}, tents: false, maxPrice: '', hasWebsite: false });
  const [work, setWork] = useState({ status: 'idle', rows: [] });
  const [selected, setSelected] = useState(null);

  const changeTab = (id) => {
    setTab(id);
    setSelected(null);
    setSearch({ status: 'idle', records: [], message: '', collectedAt: null });
    setFilters((f) => ({ ...f, kind: 'all', amenities: {}, tents: false }));
  };

  useEffect(() => {
    if (tab !== 'work' || work.status !== 'idle') return;
    setWork({ status: 'loading', rows: [] });
    fetchApprovedOpportunities().then((r) => setWork(r));
  }, [tab, work.status]);

  const runSearch = async (e) => {
    e.preventDefault();
    if (!OSM_TABS.includes(tab)) return;
    setSelected(null);
    setSearch({ status: 'loading', records: [], message: '', collectedAt: null });
    const r = await fetchOsmCampings(place, { category: tab });
    setSearch({ ...r, records: dedupeLodgings(r.records) });
  };

  const addToPlan = (kind, item) => {
    const { draft: next, added } = addStay(draft, buildStayEntry(item, kind));
    if (added) {
      setDraft(() => next);
      notify(`Adicionado ao ${activePlanName(draft)}.`);
    } else notify('Esse local já está no planejador.');
  };
  const inPlan = (kind, item) => (draft.stays ?? []).some((s) => s.id === `${kind}:${item.id}`);

  const camp = filterLodgings(search.records ?? [], filters);
  const workResult = filterOpportunities(work.rows, { place });

  if (selected) {
    return (
      <section className="page-section">
        <PlaceDetail
          kind={selected.kind === 'work_exchange' ? 'work_exchange' : 'camping'}
          place={selected.item}
          onBack={() => setSelected(null)}
          onAddToPlan={() => addToPlan(selected.kind, selected.item)}
          added={inPlan(selected.kind, selected.item)}
        />
        <p className="flights-note">
          <button className="back-link" onClick={() => onNavigate('Planejador')}>Ir para o planejador →</button>
        </p>
      </section>
    );
  }

  const toggleAmenity = (k) => setFilters((f) => ({ ...f, amenities: { ...f.amenities, [k]: !f.amenities[k] } }));

  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">DORMIR BARATO</p>
          <h1>
            Hotel, hostel, camping <span>e trabalho em troca.</span>
          </h1>
          <p className="section-subtitle">
            Só aparece o que existe nas fontes consultadas, com a origem de cada dado. Nada de local ou vaga de exemplo.
          </p>
        </div>
      </div>

      <div className="plan-add" role="tablist" aria-label="Tipo de hospedagem">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'btn-primary' : 'btn-outline'} onClick={() => changeTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={runSearch} className="flights-form">
        <label>
          Cidade, região ou estado
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Ex.: Florianópolis" required={OSM_TABS.includes(tab) || tab === 'aupair'} />
        </label>
        {OSM_TABS.includes(tab) && (
          <button className="btn-primary" type="submit" disabled={search.status === 'loading'}>
            {search.status === 'loading' ? 'Procurando…' : SEARCH_LABEL[tab]}
          </button>
        )}
      </form>

      {OSM_TABS.includes(tab) && (
        <>
          <fieldset className="stay-filters">
            <legend>Filtros</legend>
            {tab === 'camping' && (
              <label>
                Tipo
                <select value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}>
                  <option value="all">Todos</option>
                  <option value="camp_site">Camping convencional</option>
                  <option value="caravan_site">Área de motorhome</option>
                </select>
              </label>
            )}
            {tab === 'hotel' && (
              <label>
                Tipo
                <select value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}>
                  <option value="all">Todos</option>
                  <option value="hotel">Hotel</option>
                  <option value="guest_house">Pousada ou casa de hóspedes</option>
                  <option value="motel">Motel</option>
                </select>
              </label>
            )}
            <label>
              Estado
              <input value={filters.state} onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value }))} />
            </label>
            <label>
              Município
              <input value={filters.city} onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))} />
            </label>
            <label>
              Preço máximo (R$, só locais com preço informado)
              <input inputMode="decimal" value={filters.maxPrice} onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))} />
            </label>
            {(tab === 'camping' ? AMENITY_FILTERS : COMFORT_FILTERS).map(([k, label]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={Boolean(filters.amenities[k])} onChange={() => toggleAmenity(k)} /> {label}
              </label>
            ))}
            {tab === 'camping' && (
              <label className="check">
                <input type="checkbox" checked={filters.tents} onChange={(e) => setFilters((f) => ({ ...f, tents: e.target.checked }))} /> Aceita barracas
              </label>
            )}
            <label className="check">
              <input type="checkbox" checked={filters.hasWebsite} onChange={(e) => setFilters((f) => ({ ...f, hasWebsite: e.target.checked }))} /> Com site
            </label>
          </fieldset>

          {search.status === 'idle' && <p className="flights-note">Digite um lugar e toque em "{SEARCH_LABEL[tab]}".</p>}
          {search.status === 'loading' && <p role="status">Consultando o OpenStreetMap…</p>}
          {(search.status === 'unavailable' || search.status === 'empty') && <p role="status">{search.message}</p>}
          {search.status === 'ok' && (
            <>
              <p role="status">
                {camp.records.length} de {search.records.length} locais
                {camp.hiddenUnknown > 0 && ` · ${camp.hiddenUnknown} ocultado(s) por falta de informação nos filtros usados`}
                {search.skipped > 0 && ` · ${search.skipped} sem coordenadas válidas ignorado(s)`}.
              </p>
              {camp.records.length === 0 && <p>Nenhum local combina com os filtros. Afrouxe um filtro para ver mais.</p>}
              <ul className="flex-list">
                {camp.records.map((c) => (
                  <li key={c.id}>
                    <span>
                      <b>{c.name ?? 'Local sem nome'}</b> · {KIND_NAME[c.kind] ?? 'hospedagem'}{c.stars ? ` · ${c.stars}★` : ''}
                      {c.city ? ` · ${c.city}` : ''}
                    </span>
                    <small>
                      {c.fee === 'free' ? 'Gratuito (segundo a fonte)' : c.fee === 'paid' ? 'Pago' : 'Preço não informado'}
                    </small>
                    <button className="btn-outline" onClick={() => setSelected({ kind: tab, item: c })}>
                      Ver detalhes
                    </button>
                  </li>
                ))}
              </ul>
              {tab !== 'camping' && <PriceLinks tab={tab} place={place} />}
              <p className="flights-note">
                Dados © OpenStreetMap contributors, licença ODbL, coletados em{' '}
                {String(search.collectedAt).slice(0, 10)}. O OSM não garante que cada local esteja aberto hoje.
              </p>
            </>
          )}
        </>
      )}

      {tab === 'aupair' && <AuPair place={place} />}

      {tab === 'work' && (
        <>
          {!hasBackend && (
            <p role="status">
              Oportunidades de trabalho em troca exigem o banco de dados (Supabase) configurado, e ele ainda não está.
              Nenhuma oportunidade é exibida sem isso.
            </p>
          )}
          {work.status === 'loading' && <p role="status">Carregando oportunidades aprovadas…</p>}
          {work.status === 'error' && <p role="alert">Não foi possível carregar as oportunidades agora.</p>}
          {work.status === 'ready' && workResult.opportunities.length === 0 && (
            <p role="status">Nenhuma oportunidade aprovada e disponível{place ? ' para essa busca' : ''} no momento.</p>
          )}
          <ul className="flex-list">
            {workResult.opportunities.map((o) => (
              <li key={o.id}>
                <span>
                  <b>{o.hostName}</b> · {o.hostType ?? 'tipo não informado'} · {[o.city, o.state].filter(Boolean).join(' / ') || 'local não informado'}
                </span>
                <small>
                  {o.hoursPerWeek !== null ? `${o.hoursPerWeek} h/semana` : 'horas não informadas'} · atualizado em{' '}
                  {String(o.updatedAt ?? '').slice(0, 10) || 'data não informada'}
                </small>
                <button className="btn-outline" onClick={() => setSelected({ kind: 'work_exchange', item: o })}>
                  Ver detalhes
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="flights-note"><Tent size={14} aria-hidden="true" /> Anúncios do Worldpackers, Workaway e WWOOF não são copiados: use os sites deles diretamente.</p>
    </section>
  );
}

const PARTNER_ID = { hotel: null, hostel: 'hostel' };

/** O OpenStreetMap não traz preço de hotel/hostel: mostramos onde conferir, sem inventar valor. */
function PriceLinks({ tab, place }) {
  const partner = partners.find((p) => p.id === PARTNER_ID[tab] && p.url.startsWith('https://'));
  const query = `${tab === 'hostel' ? 'hostel' : 'hotel'} ${place}`.trim();
  return (
    <div className="flights-note" role="note">
      <p>O mapa não informa preço nem disponibilidade. Para ver valores e reservar, confira nos sites:</p>
      <ul className="flex-list">
        {partner && (
          <li>
            <span><b>{partner.name}</b> · {partner.text}</span>
            <a className="btn-outline" href={partner.url} target="_blank" rel="noopener noreferrer sponsored">Ver preços</a>
          </li>
        )}
        {[['Booking.com', 'booking.com'], ['Hostelworld', 'hostelworld.com']].map(([name, domain]) => (
          <li key={domain}>
            <span><b>{name}</b> · pesquisa no site</span>
            <a className="btn-outline" href={searchUrl(domain, query)} target="_blank" rel="noopener noreferrer">Pesquisar</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Au pair não tem base aberta: o app só orienta e leva às agências, sem listar vagas. */
function AuPair({ place }) {
  const group = searchGroups.find((g) => g.id === 'aupair');
  const query = `au pair ${place}`.trim();
  return (
    <div className="flights-note" role="note">
      <p>Não copiamos vagas de au pair: elas ficam nos sites das agências. {group.note}</p>
      <ul className="flex-list">
        {group.sites.map((site) => (
          <li key={site.domain}>
            <span><b>{site.name}</b> · pesquisa no site</span>
            <a className="btn-outline" href={searchUrl(site.domain, query)} target="_blank" rel="noopener noreferrer">Pesquisar</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
