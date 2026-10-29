import { ArrowUpRight, Plus, Trash2 } from 'lucide-react';
import { parseBRL } from '../api/fx.js';
import { partners } from '../data/partners.js';

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

  const amountOf = (it) => {
    const n = parseBRL(it.amount);
    return Number.isFinite(n) ? n : 0;
  };
  const total = items.reduce((sum, it) => sum + amountOf(it), 0);
  const limit = parseBRL(draft.budget);
  const hasLimit = Number.isFinite(limit) && limit > 0;
  const diff = hasLimit ? limit - total : null;

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

      <div className={`plan-total${diff !== null ? (diff >= 0 ? ' ok' : ' over') : ''}`} role="status">
        <span>Total do plano</span>
        <strong>{brl(total)}</strong>
        {diff === null && <small>Defina o orçamento acima para ver se cabe.</small>}
        {diff !== null && diff >= 0 && <small>Cabe no seu limite. Sobram {brl(diff)}.</small>}
        {diff !== null && diff < 0 && (
          <small>Estoura o limite em {brl(-diff)}. Tente o comparador de combos para baratear o transporte.</small>
        )}
      </div>
    </section>
  );
}
