import { useState } from 'react';
import { Plane } from 'lucide-react';
import { fetchFlights } from '../api/flights.js';

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const EMPTY = { origin: '', destination: '', date: '', returnDate: '', month: '', oneWay: false, adults: '1' };

export function FlightsCard() {
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ status: 'idle', flights: [], error: '' });
  const set = (k) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value.trim();
    setForm((f) => ({ ...f, [k]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.oneWay && form.date && form.returnDate && form.returnDate < form.date) {
      setState({ status: 'error', flights: [], error: 'A volta precisa ser depois da ida.' });
      return;
    }
    setState({ status: 'loading', flights: [], error: '' });
    try {
      const data = await fetchFlights({ ...form, adults: Number(form.adults) });
      setState({ status: 'done', flights: data.flights, error: '' });
    } catch (err) {
      setState({ status: 'error', flights: [], error: err.message });
    }
  };

  return (
    <section className="flights-card">
      <h3>
        <Plane size={18} aria-hidden="true" /> Passagens mais baratas
      </h3>
      <form onSubmit={submit} className="flights-form">
        <div className="trip-type" role="radiogroup" aria-label="Tipo de viagem">
          <label className="check">
            <input type="radio" name="trip" checked={!form.oneWay} onChange={() => setForm((f) => ({ ...f, oneWay: false }))} />
            Ida e volta
          </label>
          <label className="check">
            <input type="radio" name="trip" checked={form.oneWay} onChange={() => setForm((f) => ({ ...f, oneWay: true, returnDate: '' }))} />
            Só ida
          </label>
        </div>
        <label>
          Origem (IATA)
          <input value={form.origin} onChange={set('origin')} placeholder="GRU" maxLength={3} required />
        </label>
        <label>
          Destino (IATA)
          <input value={form.destination} onChange={set('destination')} placeholder="LIS" maxLength={3} required />
        </label>
        <label>
          Dia da ida
          <input type="date" value={form.date} onChange={set('date')} />
        </label>
        <label>
          Dia da volta
          <input type="date" value={form.returnDate} min={form.date || undefined} onChange={set('returnDate')} disabled={form.oneWay} />
        </label>
        <label>
          Ou só o mês
          <input type="month" value={form.month} onChange={set('month')} disabled={Boolean(form.date)} />
        </label>
        <label>
          Passageiros
          <select value={form.adults} onChange={set('adults')}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-outline" type="submit" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {state.status === 'error' && <p role="alert">{state.error}</p>}
      {state.status === 'done' && state.flights.length === 0 && <p>Nenhum preço encontrado.</p>}
      <ul className="flights-list">
        {state.flights.map((f) => (
          <li key={f.link}>
            <a href={f.link} target="_blank" rel="noopener noreferrer sponsored">
              <b>{brl(f.total)}</b>
              {f.passengers > 1 ? ` (${brl(f.price)} por pessoa)` : ''} · {f.airline} · {fmtDate(f.departureAt)}
              {f.returnAt ? ` → ${fmtDate(f.returnAt)}` : ''}
              {f.transfers === 0 ? ' · direto' : ` · ${f.transfers} escala(s)`}
            </a>
          </li>
        ))}
      </ul>
      <p className="flights-note">Preços de cache (até 48h), em reais. Confirme no site antes de comprar.</p>
    </section>
  );
}
