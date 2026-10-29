import { useEffect, useState } from 'react';
import { Tent } from 'lucide-react';
import { fetchOsmCampings } from '../services/lodging/osmCamping.js';
import { dedupeLodgings, filterLodgings } from '../services/lodging/lodgingModel.js';
import { filterOpportunities } from '../services/workExchange/opportunity.js';
import { fetchApprovedOpportunities } from '../api/workExchange.js';
import { addStay, buildStayEntry } from '../services/planner/stays.js';
import { PlaceDetail } from '../components/PlaceDetail.jsx';
import { hasBackend } from '../api/supabase.js';

const AMENITY_FILTERS = [
  ['toilets', 'Banheiro'],
  ['shower', 'Chuveiro'],
  ['kitchen', 'Cozinha'],
  ['drinkingWater', 'Água'],
  ['power', 'Energia'],
];

export function Stays({ draft, setDraft, notify, onNavigate }) {
  const [tab, setTab] = useState('camping');
  const [place, setPlace] = useState('');
  const [search, setSearch] = useState({ status: 'idle', records: [], message: '', collectedAt: null });
  const [filters, setFilters] = useState({ kind: 'all', state: '', city: '', amenities: {}, tents: false, maxPrice: '', hasWebsite: false });
  const [work, setWork] = useState({ status: 'idle', rows: [] });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (tab !== 'work' || work.status !== 'idle') return;
    setWork({ status: 'loading', rows: [] });
    fetchApprovedOpportunities().then((r) => setWork(r));
  }, [tab, work.status]);

  const runSearch = async (e) => {
    e.preventDefault();
    setSelected(null);
    setSearch({ status: 'loading', records: [], message: '', collectedAt: null });
    const r = await fetchOsmCampings(place);
    setSearch({ ...r, records: dedupeLodgings(r.records) });
  };

  const addToPlan = (kind, item) => {
    const { draft: next, added } = addStay(draft, buildStayEntry(item, kind));
    if (added) {
      setDraft(() => next);
      notify('Adicionado ao planejador.');
    } else notify('Esse local já está no planejador.');
  };
  const inPlan = (kind, item) => (draft.stays ?? []).some((s) => s.id === `${kind}:${item.id}`);

  const camp = filterLodgings(search.records ?? [], filters);
  const workResult = filterOpportunities(work.rows, { place });

  if (selected) {
    return (
      <section className="page-section">
        <PlaceDetail
          kind={selected.kind}
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
            Campings e <span>trabalho em troca.</span>
          </h1>
          <p className="section-subtitle">
            Só aparece o que existe nas fontes consultadas, com a origem de cada dado. Nada de local ou vaga de exemplo.
          </p>
        </div>
      </div>

      <div className="plan-add" role="tablist" aria-label="Tipo de hospedagem">
        {[['camping', 'Campings'], ['work', 'Trabalho em troca']].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'btn-primary' : 'btn-outline'} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={runSearch} className="flights-form">
        <label>
          Cidade, região ou estado
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Ex.: Florianópolis" required={tab === 'camping'} />
        </label>
        {tab === 'camping' && (
          <button className="btn-primary" type="submit" disabled={search.status === 'loading'}>
            {search.status === 'loading' ? 'Procurando…' : 'Procurar campings'}
          </button>
        )}
      </form>

      {tab === 'camping' && (
        <>
          <fieldset className="stay-filters">
            <legend>Filtros</legend>
            <label>
              Tipo
              <select value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))}>
                <option value="all">Todos</option>
                <option value="camp_site">Camping convencional</option>
                <option value="caravan_site">Área de motorhome</option>
              </select>
            </label>
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
            {AMENITY_FILTERS.map(([k, label]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={Boolean(filters.amenities[k])} onChange={() => toggleAmenity(k)} /> {label}
              </label>
            ))}
            <label className="check">
              <input type="checkbox" checked={filters.tents} onChange={(e) => setFilters((f) => ({ ...f, tents: e.target.checked }))} /> Aceita barracas
            </label>
            <label className="check">
              <input type="checkbox" checked={filters.hasWebsite} onChange={(e) => setFilters((f) => ({ ...f, hasWebsite: e.target.checked }))} /> Com site
            </label>
          </fieldset>

          {search.status === 'idle' && <p className="flights-note">Digite um lugar e toque em "Procurar campings".</p>}
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
                      <b>{c.name ?? 'Camping sem nome'}</b> · {c.kind === 'caravan_site' ? 'área de motorhome' : 'camping'}
                      {c.city ? ` · ${c.city}` : ''}
                    </span>
                    <small>
                      {c.fee === 'free' ? 'Gratuito (segundo a fonte)' : c.fee === 'paid' ? 'Pago' : 'Preço não informado'}
                    </small>
                    <button className="btn-outline" onClick={() => setSelected({ kind: 'camping', item: c })}>
                      Ver detalhes
                    </button>
                  </li>
                ))}
              </ul>
              <p className="flights-note">
                Dados © OpenStreetMap contributors, licença ODbL, coletados em{' '}
                {String(search.collectedAt).slice(0, 10)}. O OSM não garante que cada local esteja aberto hoje.
              </p>
            </>
          )}
        </>
      )}

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
