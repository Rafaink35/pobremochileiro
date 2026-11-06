import { ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { parseBRL } from '../api/fx.js';
import { partners } from '../data/partners.js';
import { searchGroups, searchUrl } from '../data/searchSites.js';
import { COST_STATUS, planSummary, removeStay, TRANSPORT_STATUS, updateStay } from '../services/planner/stays.js';

export const PLAN_CATEGORIES = ['Transporte', 'Hospedagem', 'Comida', 'Passeios', 'Extras'];

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Selo do valor de cada item: mostra de onde veio o número (nada de estimativa passando por preço confirmado).
const STATUS_BADGE = {
  confirmed: ['confirmado', 'confirmed'],
  published: ['publicado, não reconfirmado', 'published'],
  estimate: ['estimativa', 'estimate'],
  stale: ['desatualizado (conta como estimativa)', 'estimate'],
};
function valueBadge(it) {
  if (!String(it.amount ?? '').trim()) return ['Preço indisponível', 'unknown'];
  return STATUS_BADGE[it.status] ?? ['informado por você', 'manual'];
}
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Lista de itens da viagem + total contra o limite. Os links "Reservar" vêm de src/data/partners.js.
export function TripPlan({ draft, setDraft }) {
  const items = draft.items || [];
  const setItems = (fn) => setDraft((old) => ({ ...old, items: fn(old.items || []) }));

  const add = (category) => setItems((list) => [...list, { id: newId(), category, label: '', amount: '' }]);
  // Ao ajustar o valor à mão, ele passa a ser "informado por você" (deixa de ser estimativa da descoberta).
  const update = (id, field, value) =>
    setItems((list) => list.map((it) => {
      if (it.id !== id) return it;
      if (field !== 'amount') return { ...it, [field]: value };
      return { ...it, amount: value, status: 'manual', adjusted: it.adjusted || Boolean(it.status && it.status !== 'manual') };
    }));
  const remove = (id) => setItems((list) => list.filter((it) => it.id !== id));

  const summary = planSummary(draft);
  const stays = draft.stays ?? [];
  const setDraftStays = (fn) => setDraft((old) => fn(old));

  const reserveLink = (category) =>
    partners.find((p) => p.category === category && p.url.startsWith('https://'));

  return (
    <section className="trip-plan">
      <h3>Seu plano, item por item</h3>
      <div className="plan-add">
        {PLAN_CATEGORIES.map((c) => (
          <button key={c} type="button" className="btn-outline" onClick={() => add(c)}>
            <Plus size={14} aria-hidden="true" /> {c}
          </button>
        ))}
      </div>

      {items.length === 0 && <p className="flights-note">Adicione os gastos da viagem. Os valores são seus; o app só soma e compara.</p>}

      <ul className="plan-list">
        {items.map((it) => {
          const source = it.url && it.url.startsWith('https://') ? { url: it.url, name: it.source || 'site' } : null;
          // Sem link da oferta: se o parceiro informado é um site conhecido (Buser, ClickBus...), oferece a pesquisa nele.
          const known = (it.partner || it.source) && searchGroups.flatMap((g) => g.sites).find((x) => x.name.toLowerCase() === String(it.partner || it.source).trim().toLowerCase());
          const link = source || (known ? { url: searchUrl(known.domain, `${it.label} ${it.carrier ?? ''}`.trim()), name: known.name, search: true } : null) || reserveLink(it.category);
          return (
            <li key={it.id} className="plan-item">
              <span className="plan-cat">{it.category}</span>
              <input
                aria-label={`Descrição (${it.category})`}
                value={it.label}
                onChange={(e) => update(it.id, 'label', e.target.value)}
                placeholder="Ex.: ônibus Rio → SP"
              />
              <input
                aria-label={`Valor (${it.category})`}
                inputMode="decimal"
                value={it.amount}
                onChange={(e) => update(it.id, 'amount', e.target.value)}
                placeholder="R$ 0,00"
              />
              {(() => {
                const [text, kind] = valueBadge(it);
                return <span className={`plan-badge badge-${kind}`}>{text}{it.adjusted ? ' (ajustado)' : ''}</span>;
              })()}
              {link && (
                <a href={link.url} target="_blank" rel="noopener noreferrer sponsored" className="plan-reserve">
                  {source ? `Comprar no ${source.name}` : link.search ? `Ver no ${link.name}` : 'Reservar'} <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              )}
              <button type="button" onClick={() => remove(it.id)} aria-label="Remover item" className="plan-remove">
                <Trash2 size={15} aria-hidden="true" />
              </button>
              <div className="plan-meta">
                <label>
                  {it.category === 'Transporte' ? 'Companhia (aérea ou terrestre)' : 'Empresa ou local'}
                  <input value={it.carrier ?? ''} onChange={(e) => update(it.id, 'carrier', e.target.value.slice(0, 60))} placeholder={it.category === 'Transporte' ? 'Ex.: LATAM, Cometa' : 'Ex.: Camping do Zé'} />
                </label>
                <label>
                  Parceiro / site da compra
                  <input value={it.partner ?? it.source ?? ''} onChange={(e) => update(it.id, 'partner', e.target.value.slice(0, 40))} placeholder="Ex.: Aviasales, Buser" />
                </label>
              </div>
            </li>
          );
        })}
      </ul>

      {stays.length > 0 && (
        <div className="plan-stays">
          <h4>Hospedagens guardadas</h4>
          <ul className="plan-list">
            {stays.map((st) => (
              <li key={st.id} className="plan-stay">
                <b>{st.name}</b>
                <span>
                  {{ work_exchange: 'Trabalho em troca', hotel: 'Hotel', hostel: 'Hostel', pousada: 'Pousada', ecovila: 'Ecovila', colaborativa: 'Hospedagem colaborativa' }[st.kind] ?? 'Camping'}
                  {[st.city, st.state].filter(Boolean).length ? ` · ${[st.city, st.state].filter(Boolean).join(' / ')}` : ''}
                </span>
                <StayBooking st={st} />
                <span>{costLabel(st.cost)}</span>
                <span>
                  {st.transport.status === TRANSPORT_STATUS.CONFIRMED
                    ? 'Transporte confirmado por você'
                    : 'Transporte ainda não calculado'}
                </span>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={st.transport.status === TRANSPORT_STATUS.CONFIRMED}
                    onChange={(e) =>
                      setDraftStays((d) =>
                        updateStay(d, st.id, {
                          transport: { status: e.target.checked ? TRANSPORT_STATUS.CONFIRMED : TRANSPORT_STATUS.NOT_CALCULATED },
                        }),
                      )
                    }
                  />
                  Já resolvi o transporte
                </label>
                <label>
                  De
                  <input type="date" value={st.dates.from} onChange={(e) => setDraftStays((d) => updateStay(d, st.id, { dates: { ...st.dates, from: e.target.value } }))} />
                </label>
                <label>
                  Até
                  <input type="date" value={st.dates.to} onChange={(e) => setDraftStays((d) => updateStay(d, st.id, { dates: { ...st.dates, to: e.target.value } }))} />
                </label>
                <small>
                  Contato: {[st.contact.website, st.contact.phone, st.contact.email].filter(Boolean).join(' · ') || 'não informado'}
                </small>
                <small>
                  Fonte: {st.source.name}
                  {st.source.verifiedAt ? ` · verificado em ${String(st.source.verifiedAt).slice(0, 10)}` : ' · data de verificação não informada'}
                </small>
                <button type="button" onClick={() => setDraftStays((d) => removeStay(d, st.id))} className="plan-remove" aria-label={`Remover ${st.name}`}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PlanTotal summary={summary} />
    </section>
  );
}

/** Onde reservar: site do próprio local e pesquisa nos parceiros de hospedagem. Sem preço inventado. */
function StayBooking({ st }) {
  const query = `${st.name} ${st.city ?? ''}`.trim();
  const sites = st.kind === 'hotel' ? [['Booking.com', 'booking.com']] : st.kind === 'hostel' ? [['Hostelworld', 'hostelworld.com'], ['Booking.com', 'booking.com']] : [];
  const website = st.contact?.website && /^https?:\/\//i.test(st.contact.website) ? st.contact.website : null;
  if (!website && sites.length === 0) return null;
  return (
    <span className="plan-booking">
      Onde reservar:{' '}
      {website && <a href={website} target="_blank" rel="noopener noreferrer">site do local</a>}
      {sites.map(([name, domain]) => (
        <a key={domain} href={searchUrl(domain, query)} target="_blank" rel="noopener noreferrer">{name}</a>
      ))}
    </span>
  );
}

function costLabel(cost) {
  switch (cost.status) {
    case COST_STATUS.FREE:
      return 'Hospedagem gratuita (segundo a fonte)';
    case COST_STATUS.EXCHANGE:
      return `Hospedagem em troca de trabalho${cost.text ? ` · despesas: ${cost.text}` : ' · despesas adicionais não informadas'}`;
    case COST_STATUS.PAID_REFERENCE:
      return `Paga · valor de referência ${cost.text ?? brl(cost.price.amount)} (unidade e noites não definidas, fora do total)`;
    case COST_STATUS.PAID_UNKNOWN:
      return 'Paga · valor não informado';
    default:
      return `Custo não informado${cost.feeTag ? ` · a fonte marca fee=${cost.feeTag} (observação, não é preço)` : ''}`;
  }
}

const CLAIM = {
  confirmed: 'Todos os valores são confirmados ou informados por você.',
  estimated: 'Há estimativas no total: o gasto real pode ser diferente.',
  incomplete: 'Resultado parcial: há custos sem valor, o custo real será maior ou igual ao mínimo.',
};

function PlanTotal({ summary }) {
  const { essentialMissing = [], limit, unknown, complete, empty, knownTotal, confirmedTotal, estimatedTotal, contingency, minimumTotal, fit, finalCostClaim } = summary;
  if (empty) return null;
  const cls = limit === null ? '' : fit === 'over' ? ' over' : fit === 'within' ? ' ok' : '';
  return (
    <div className={`plan-total${cls}`} role="status">
      <span>{complete && essentialMissing.length === 0 ? 'Total do plano' : 'Total parcial (só valores informados)'}</span>
      <strong>{brl(knownTotal)}</strong>
      <dl className="trip-totals">
        <div><dt>Confirmado ou informado por você</dt><dd>{brl(confirmedTotal)}</dd></div>
        <div><dt>Estimado</dt><dd>{brl(estimatedTotal)}</dd></div>
        <div><dt>Reserva para imprevistos ({contingency.pct}%)</dt><dd>{contingency.amount !== null ? brl(contingency.amount) : 'não calculada'}</dd></div>
        <div><dt>Custo mínimo (com reserva)</dt><dd><b>{brl(minimumTotal)}</b></dd></div>
      </dl>
      <small>{CLAIM[finalCostClaim]}</small>
      {!complete && (
        <small>
          {unknown.length} item(ns) sem valor ou sem cálculo: {unknown.slice(0, 4).join('; ')}
          {unknown.length > 4 ? '…' : ''}.
        </small>
      )}
      {essentialMissing.length > 0 && (
        <small>Custos essenciais sem nenhum valor no plano: {essentialMissing.join(', ')}. Sem eles, o total é parcial.</small>
      )}
      {limit === null && <small>Defina o orçamento acima para comparar.</small>}
      {limit !== null && fit === 'over' && <small>O custo mínimo passa do limite em {brl(minimumTotal - limit)}, mesmo sem os itens que faltam.</small>}
      {limit !== null && fit === 'within' && <small>Cabe no seu limite com a reserva. Sobram {brl(limit - minimumTotal)}.</small>}
      {limit !== null && fit === 'within_partial' && <small>Resultado parcial: não dá para afirmar que cabe, porque faltam valores.</small>}
    </div>
  );
}
