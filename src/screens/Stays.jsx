import { useEffect, useState } from 'react';
import { Tent } from 'lucide-react';
import { fetchStays } from '../api/stays.js';
import { flattenGroups } from '../services/stays/legacy.js';
import { StayResults } from '../components/StayResults.jsx';
import { filterLodgings } from '../services/lodging/lodgingModel.js';
import { filterOpportunities } from '../services/workExchange/opportunity.js';
import { fetchApprovedOpportunities } from '../api/workExchange.js';
import { addStay, buildStayEntry } from '../services/planner/stays.js';
import { PlaceDetail } from '../components/PlaceDetail.jsx';
import { hasBackend } from '../api/supabase.js';
import { activePlanName } from '../services/planner/plans.js';
import { partners } from '../data/partners.js';
import { searchGroups, searchUrl } from '../data/searchSites.js';

const TABS = [['camping', 'Campings'], ['hostel', 'Hostels'], ['pousada', 'Pousadas'], ['ecovila', 'Ecovilas'], ['colaborativa', 'Hospedagem colaborativa'], ['hotel', 'Hotéis'], ['work', 'Trabalho em troca'], ['aupair', 'Au pair']];
// Abas de busca de local. TODA consulta externa passa pelo servidor (/api/stays), com cache e limite de requisições:
// o navegador nunca consulta Overpass, Nominatim ou Wikivoyage diretamente.
const STAY_TABS = ['camping', 'hostel', 'pousada', 'ecovila', 'colaborativa', 'hotel'];
const OSM_TABS = STAY_TABS;
const SEARCH_LABEL = { hotel: 'Procurar hotéis', hostel: 'Procurar hostels', camping: 'Procurar campings', pousada: 'Procurar pousadas', ecovila: 'Procurar ecovilas', colaborativa: 'Procurar hospedagem colaborativa' };
const NOUN = { hotel: 'hotéis', hostel: 'hostels', camping: 'campings', pousada: 'pousadas', ecovila: 'ecovilas', colaborativa: 'hospedagem colaborativa' };
const KIND_NAME = { camp_site: 'camping', caravan_site: 'área de motorhome', hotel: 'hotel', motel: 'motel', guest_house: 'pousada', hostel: 'hostel', other: 'tipo não identificado' };
const LEGACY_NOTE = { status: 'idle', records: [], message: '', collectedAt: null, meta: null, candidates: [] };

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
  const [tab, setTab] = useState('camping');
  const [place, setPlace] = useState('');
  const [search, setSearch] = useState(LEGACY_NOTE);
  const [filters, setFilters] = useState({ kind: 'all', state: '', city: '', amenities: {}, tents: false, maxPrice: '', hasWebsite: false });
  const [includeUnclassified, setIncludeUnclassified] = useState(false);
  const [work, setWork] = useState({ status: 'idle', rows: [] });
  const [selected, setSelected] = useState(null);

  const changeTab = (id) => {
    setTab(id);
    setSelected(null);
    setSearch(LEGACY_NOTE);
    setFilters((f) => ({ ...f, kind: 'all', amenities: {}, tents: false }));
  };

  useEffect(() => {
    if (tab !== 'work' || work.status !== 'idle') return;
    setWork({ status: 'loading', rows: [] });
    fetchApprovedOpportunities().then((r) => setWork(r));
  }, [tab, work.status]);

  // Pesquisa pelo servidor (qualquer país). `choice` = candidato escolhido quando o destino é ambíguo.
  const runSearch = async (e, choice) => {
    e?.preventDefault?.();
    if (!STAY_TABS.includes(tab)) return;
    setSelected(null);
    setSearch({ ...LEGACY_NOTE, status: 'loading' });
    const categoryParam = includeUnclassified ? `${tab},nao_classificada` : tab;
    const api = await fetchStays(choice
      ? { lat: choice.lat, lon: choice.lon, name: choice.name, nameEn: choice.nameEn, label: choice.label, cc: choice.countryCode, rc: choice.regionCode, r: choice.radiusM, category: categoryParam }
      : { q: place, category: categoryParam });
    if (api.status === 'aborted') return;
    if (api.status === 'ambiguous' || api.status === 'broad') return setSearch({ ...LEGACY_NOTE, status: 'ambiguous', message: api.message, candidates: api.candidates });
    if ((api.status === 'ok' || api.status === 'partial') && api.groups) {
      const records = flattenGroups(api.groups);
      return setSearch({ ...LEGACY_NOTE, status: records.length || api.categoryNotes?.length ? 'ok' : 'empty', records, collectedAt: api.collectedAt, meta: api, message: records.length ? '' : api.message });
    }
    setSearch({ ...LEGACY_NOTE, status: api.status === 'unavailable' ? 'unavailable' : 'empty', message: api.message ?? 'Não foi possível pesquisar agora.' });
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
          Cidade ou destino (qualquer país)
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Ex.: Florianópolis, Lisboa, 東京" required={OSM_TABS.includes(tab) || tab === 'aupair'} />
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
            <label className="check">
              <input type="checkbox" checked={includeUnclassified} onChange={(e) => setIncludeUnclassified(e.target.checked)} /> Incluir locais sem tipo identificado (próxima pesquisa)
            </label>
          </fieldset>

          {search.status === 'idle' && <p className="flights-note">Digite um lugar e toque em "{SEARCH_LABEL[tab]}".</p>}
          {search.status === 'loading' && <p role="status">Consultando as fontes…</p>}
          {(search.status === 'unavailable' || search.status === 'empty') && <p role="status">{search.message}</p>}
          {search.status === 'ambiguous' && (
            <div role="group" aria-label="Escolha o destino">
              <p role="status">{search.message}</p>
              <ul className="flex-list">
                {search.candidates.map((c) => (
                  <li key={c.id}>
                    <span><b>{c.name}</b> · {[c.region, c.country].filter(Boolean).join(', ') || c.label}</span>
                    <button className="btn-outline" onClick={() => runSearch(null, c)}>{c.referencePoint ? `Pesquisar a ${Math.round(c.radiusM / 1000)} km do ponto de referência` : 'Pesquisar aqui'}</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {search.status === 'ok' && search.meta && (
            <>
              <StayResults
                meta={search.meta}
                records={camp.records}
                kindName={KIND_NAME}
                onOpen={(c) => setSelected({ kind: tab, item: c })}
                onAdd={(c) => addToPlan(tab, c)}
                inPlan={(c) => inPlan(tab, c)}
              />
              {['hotel', 'hostel', 'pousada'].includes(tab) && <PriceLinks tab={tab} place={place} />}
              {['ecovila', 'colaborativa'].includes(tab) && <CommunityLinks tab={tab} place={place} onNavigate={onNavigate} onWork={() => changeTab('work')} />}
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

const PARTNER_ID = { hotel: null, hostel: 'hostel', pousada: null };

/** Ecovilas e hospedagem colaborativa não têm dados abertos confiáveis: só pesquisa nos diretórios, sem copiar anúncios. */
function CommunityLinks({ tab, place, onWork }) {
  const groups = tab === 'ecovila' ? ['ecovila'] : ['colaborativa', 'volunteer'];
  const query = `${tab === 'ecovila' ? 'ecovillage' : 'volunteer'} ${place}`.trim();
  return (
    <div className="flights-note" role="note">
      <p>Não listamos locais sem fonte aberta confiável. Pesquise diretamente nos diretórios (os links só abrem uma busca no site):</p>
      <ul className="flex-list">
        {groups.flatMap((id) => searchGroups.find((g) => g.id === id)?.sites ?? []).map((site) => (
          <li key={site.domain}>
            <span><b>{site.name}</b> · pesquisa no site</span>
            <a className="btn-outline" href={searchUrl(site.domain, query)} target="_blank" rel="noopener noreferrer">Pesquisar</a>
          </li>
        ))}
      </ul>
      {tab === 'colaborativa' && <button type="button" className="btn-outline" onClick={onWork}>Ver oportunidades aprovadas de trabalho em troca</button>}
    </div>
  );
}

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
