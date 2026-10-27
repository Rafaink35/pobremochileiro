import { useState } from 'react';
import { Plane } from 'lucide-react';
import { fetchFlights } from '../api/flights.js';

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

export function FlightsCard() {
  const [form, setForm] = useState({ origin: '', destination: '', month: '' });
  const [state, setState] = useState({ status: 'idle', flights: [], error: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value.trim() }));

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: 'loading', flights: [], error: '' });
    try {
      const data = await fetchFlights(form);
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
      <form onSubmit={submit} className="form-two">
        <label>
          Origem (IATA)
          <input value={form.origin} onChange={set('origin')} placeholder="GRU" maxLength={3} required />
        </label>
        <label>
          Destino (IATA)
          <input value={form.destination} onChange={set('destination')} placeholder="LIS" maxLength={3} required />
        </label>
        <label>
          Mês (opcional)
          <input type="month" value={form.month} onChange={set('month')} />
        </label>
        <button className="btn-outline" type="submit" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {state.status === 'error' && <p role="alert">{state.error}</p>}
      {state.status === 'done' && state.flights.length === 0 && <p>Nenhum preço encontrado.</p>}
      <ul>
        {state.flights.map((f) => (
          <li key={f.link}>
            <a href={f.link} target="_blank" rel="noopener noreferrer sponsored">
              {brl(f.price)} · {f.airline} · {fmtDate(f.departureAt)}
              {f.transfers === 0 ? ' · direto' : ` · ${f.transfers} escala(s)`}
            </a>
          </li>
        ))}
      </ul>
      <p className="summary-warning">Preços de cache (até 48h). Confirme no site antes de comprar.</p>
    </section>
  );
}
