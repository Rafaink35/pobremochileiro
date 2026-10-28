import { useState } from 'react';
import { Plane } from 'lucide-react';
import { fetchCalendar, fetchFlights } from '../api/flights.js';

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—');

const monthLabel = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const name = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${name}/${String(y).slice(2)}`;
};

const EMPTY = { origin: '', destination: '', date: '', returnDate: '', month: '', oneWay: false, adults: '1' };

export function FlightsCard() {
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ status: 'idle', flights: [], error: '' });
  const [cal, setCal] = useState({ status: 'idle', months: [], error: '' });
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
      setState({ status: 'done', flights: data.flights, error: '', approximate: data.approximate });
    } catch (err) {
      setState({ status: 'error', flights: [], error: err.message });
    }
  };

  const loadCalendar = async () => {
    if (!/^[A-Za-z]{3}$/.test(form.origin) || !/^[A-Za-z]{3}$/.test(form.destination)) {
      setCal({ status: 'error', months: [], error: 'Preencha origem e destino (códigos de 3 letras).' });
      return;
    }
    setCal({ status: 'loading', months: [], error: '' });
    try {
      const data = await fetchCalendar(form);
      setCal({ status: 'done', months: data.months, error: '' });
    } catch (err) {
      setCal({ status: 'error', months: [], error: err.message });
    }
  };

  const pickMonth = (month) => setForm((f) => ({ ...f, month, date: '', returnDate: '' }));

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
      <div className="month-calendar">
        <button type="button" className="btn-outline" onClick={loadCalendar} disabled={cal.status === 'loading'}>
          {cal.status === 'loading' ? 'Procurando…' : 'Ver o melhor mês para viajar'}
        </button>
        {cal.status === 'error' && <p role="alert">{cal.error}</p>}
        {cal.status === 'done' && (
          <>
            <div className="month-grid">
              {cal.months.map((m) => (
                <button
                  type="button"
                  key={m.month}
                  className={`month-cell${m.isBest ? ' best' : ''}`}
                  disabled={m.price == null}
                  onClick={() => pickMonth(m.month)}
                >
                  <span>{monthLabel(m.month)}</span>
                  <b>{m.price == null ? '—' : brl(m.price)}</b>
                  {m.isBest && <em>mais barato</em>}
                </button>
              ))}
            </div>
            <p className="flights-note">
              Menor preço guardado por mês (cache). Toque em um mês para escolhê-lo e depois clique em Buscar.
            </p>
          </>
        )}
      </div>
      {state.status === 'error' && <p role="alert">{state.error}</p>}
      {state.status === 'done' && state.flights.length === 0 && (
        <p>Nenhum preço guardado para essa rota. Tente outras datas, só o mês ou outro destino.</p>
      )}
      {state.approximate && (
        <p>Não há preço guardado para os dias exatos. Mostrando as opções mais baratas do mesmo mês.</p>
      )}
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
      <p className="flights-note">Preços de cache (até 48h), em reais. O site do Aviasales pode mostrar o valor em dólar: use o preço acima como referência e confirme lá antes de comprar.</p>
    </section>
  );
}
