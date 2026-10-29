import { useState } from 'react';
import { CalendarSearch } from 'lucide-react';
import { fetchFlex } from '../api/flights.js';

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt = (d) => (d ? d.split('-').reverse().slice(0, 2).join('/') : '—');
const IATA = /^[A-Za-z]{3}$/;
const EMPTY = { origin: '', destination: '', from: '', to: '', minStay: '', maxStay: '', oneWay: false, adults: '1' };

export function FlexSearch({ onUseInPlan }) {
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ status: 'idle', error: '', days: [] });
  const [added, setAdded] = useState(null);
  const set = (k) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
    setForm((f) => ({ ...f, [k]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!IATA.test(form.origin) || !IATA.test(form.destination)) {
      setState({ status: 'error', error: 'Use códigos de 3 letras (ex.: GRU, BOG).', days: [] });
      return;
    }
    setAdded(null);
    setState({ status: 'loading', error: '', days: [] });
    try {
      const data = await fetchFlex({
        ...form,
        adults: Number(form.adults),
        minStay: Number(form.minStay) || 0,
        maxStay: Number(form.maxStay) || 0,
      });
      setState({ status: 'done', error: '', days: data.days });
    } catch (err) {
      setState({ status: 'error', error: err.message, days: [] });
    }
  };

  const cheapest = [...state.days].sort((a, b) => a.price - b.price).slice(0, 10);

  const use = (d) => {
    onUseInPlan?.([
      {
        label: `Voo ${form.origin.toUpperCase()} → ${form.destination.toUpperCase()} (${fmt(d.day)}${d.returnDay ? ` a ${fmt(d.returnDay)}` : ''})`,
        amount: d.total.toFixed(2).replace('.', ','),
        url: d.link,
        source: 'Aviasales',
      },
    ]);
    setAdded(d.day);
  };

  return (
    <section className="flex-card">
      <h3>
        <CalendarSearch size={18} aria-hidden="true" /> Datas flexíveis
      </h3>
      <p className="flights-note">
        Informe o período em que você aceita sair. O app mostra os dias de ida mais baratos (preços de cache).
      </p>
      <form onSubmit={submit} className="flights-form">
        <div className="trip-type" role="radiogroup" aria-label="Tipo de viagem">
          <label className="check">
            <input type="radio" name="flex-trip" checked={!form.oneWay} onChange={() => setForm((f) => ({ ...f, oneWay: false }))} />
            Ida e volta
          </label>
          <label className="check">
            <input type="radio" name="flex-trip" checked={form.oneWay} onChange={() => setForm((f) => ({ ...f, oneWay: true }))} />
            Só ida
          </label>
        </div>
        <label>
          Origem (IATA)
          <input value={form.origin} onChange={set('origin')} placeholder="GRU" maxLength={3} required />
        </label>
        <label>
          Destino (IATA)
          <input value={form.destination} onChange={set('destination')} placeholder="BOG" maxLength={3} required />
        </label>
        <label>
          Sair a partir de
          <input type="date" value={form.from} onChange={set('from')} required />
        </label>
        <label>
          Sair até
          <input type="date" value={form.to} min={form.from || undefined} onChange={set('to')} required />
        </label>
        <label>
          Mínimo de dias fora
          <input inputMode="numeric" value={form.minStay} onChange={set('minStay')} placeholder="10" disabled={form.oneWay} />
        </label>
        <label>
          Máximo de dias fora
          <input inputMode="numeric" value={form.maxStay} onChange={set('maxStay')} placeholder="20" disabled={form.oneWay} />
        </label>
        <label>
          Passageiros
          <select value={form.adults} onChange={set('adults')}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-outline" type="submit" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Procurando…' : 'Achar os dias mais baratos'}
        </button>
      </form>
      {state.status === 'error' && <p role="alert">{state.error}</p>}
      {state.status === 'done' && state.days.length === 0 && (
        <p>Nenhum preço guardado nesse período. Tente um período maior, menos restrição de dias fora, ou outro destino.</p>
      )}
      {cheapest.length > 0 && (
        <ul className="flex-list">
          {cheapest.map((d, i) => (
            <li key={d.day} className={i === 0 ? 'best' : ''}>
              <span>
                <b>{fmt(d.day)}</b>
                {d.returnDay ? ` → ${fmt(d.returnDay)} (${d.stayDays} dias)` : ' · só ida'}
                {i === 0 ? ' · mais barato' : ''}
              </span>
              <strong>
                {brl(d.total)}
                {d.passengers > 1 ? ` (${brl(d.price)} por pessoa)` : ''}
              </strong>
              <a href={d.link} target="_blank" rel="noopener noreferrer sponsored">
                Ver voo
              </a>
              {onUseInPlan && (
                <button type="button" className="btn-outline" onClick={() => use(d)} disabled={added === d.day}>
                  {added === d.day ? 'Adicionado ✓' : 'Usar no plano'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
