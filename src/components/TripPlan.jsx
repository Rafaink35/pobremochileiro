import { ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { parseBRL } from '../api/fx.js';
import { partners } from '../data/partners.js';
import { COST_STATUS, planSummary, removeStay, TRANSPORT_STATUS, updateStay } from '../services/planner/stays.js';

export const PLAN_CATEGORIES = ['Transporte', 'Hospedagem', 'Comida', 'Passeios', 'Extras'];

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Lista de itens da viagem + total contra o limite. Os links "Reservar" vêm de src/data/partners.js.
export function TripPlan({ draft, setDraft }) {
  const items = draft.items || [];
  const setItems = (fn) => setDraft((old) => ({ ...old, items: fn(old.items || []) }));

  const add = (category) => setItems((list) => [...list, { id: newId(), category, label: '', amount: '' }]);
  const update = (id, field, value) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  const remove = (id) => setItems((list) => list.filter((it) => it.id !== id));

  const summary = planSummary(draft);
  const total = summary.knownTotal;
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
          const link = source || reserveLink(it.category);
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
              {link && (
                <a href={link.url} target="_blank" rel="noopener noreferrer sponsored" className="plan-reserve">
                  {source ? `Comprar no ${source.name}` : 'Reservar'} <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              )}
              <button type="button" onClick={() => remove(it.id)} aria-label="Remover item" className="plan-remove">
                <Trash2 size={15} aria-hidden="true" />
              </button>
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
                <span>{st.kind === 'work_exchange' ? 'Trabalho em troca' : 'Camping'}</span>
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

      <PlanTotal summary={summary} total={total} />
    </section>
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
      return 'Custo não informado';
  }
}

function PlanTotal({ summary, total }) {
  const { limit, unknown, complete, empty } = summary;
  if (empty) return null;
  const over = limit !== null && total > limit;
  const cls = limit === null ? '' : over ? ' over' : complete ? ' ok' : '';
  return (
    <div className={`plan-total${cls}`} role="status">
      <span>{complete ? 'Total do plano' : 'Total parcial (só valores informados)'}</span>
      <strong>{brl(total)}</strong>
      {!complete && (
        <small>
          {unknown.length} item(ns) sem valor ou sem cálculo: {unknown.slice(0, 4).join('; ')}
          {unknown.length > 4 ? '…' : ''}. O custo real será maior ou igual a esse total.
        </small>
      )}
      {limit === null && <small>Defina o orçamento acima para comparar.</small>}
      {limit !== null && over && <small>Já passa do limite em {brl(total - limit)}, mesmo sem os itens que faltam.</small>}
      {limit !== null && !over && complete && <small>Cabe no seu limite. Sobram {brl(limit - total)}.</small>}
      {limit !== null && !over && !complete && (
        <small>Ainda não dá para dizer se cabe no limite: faltam valores.</small>
      )}
    </div>
  );
}
