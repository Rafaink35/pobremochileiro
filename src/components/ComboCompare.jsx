import { useState } from 'react';
import { Route } from 'lucide-react';
import { fetchFlights } from '../api/flights.js';
import { parseBRL } from '../api/fx.js';

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const IATA = /^[A-Za-z]{3}$/;
const EMPTY = { destination: '', directFrom: '', hubFrom: '', ground: '', month: '', adults: '1' };

async function cheapest(origin, destination, month, adults) {
  const data = await fetchFlights({ origin, destination, month, adults });
  return data.flights[0] || null;
}

export function ComboCompare({ onUseInPlan }) {
  const [form, setForm] = useState(EMPTY);
  const [state, setState] = useState({ status: 'idle', error: '', result: null });
  const [added, setAdded] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value.trim() }));

  const submit = async (e) => {
    e.preventDefault();
    const ground = parseBRL(form.ground);
    if (!IATA.test(form.destination) || !IATA.test(form.directFrom) || !IATA.test(form.hubFrom)) {
      setState({ status: 'error', error: 'Use códigos de 3 letras (ex.: GIG, GRU, LIS).', result: null });
      return;
    }
    if (!(ground >= 0)) {
      setState({ status: 'error', error: 'Digite quanto custa o ônibus (por pessoa).', result: null });
      return;
    }
    const adults = Number(form.adults);
    setAdded(null);
    setState({ status: 'loading', error: '', result: null });
    try {
      const [direct, hub] = await Promise.all([
        cheapest(form.directFrom, form.destination, form.month, adults),
        cheapest(form.hubFrom, form.destination, form.month, adults),
      ]);
      const groundTotal = ground * adults;
      setState({
        status: 'done',
        error: '',
        result: {
          direct: direct && { ...direct, total: direct.total },
          combo: hub && { ...hub, ground: groundTotal, total: hub.total + groundTotal },
        },
      });
    } catch (err) {
      setState({ status: 'error', error: err.message, result: null });
    }
  };

  const { result } = state;
  const money = (n) => n.toFixed(2).replace('.', ',');
  const useDirect = () => {
    const { directFrom, destination } = form;
    onUseInPlan([
      {
        label: `Voo ${directFrom.toUpperCase()} → ${destination.toUpperCase()}`,
        amount: money(result.direct.total),
        url: result.direct.link,
        source: 'Aviasales',
      },
    ]);
    setAdded('direct');
  };
  const useCombo = () => {
    const { hubFrom, destination } = form;
    onUseInPlan([
      { label: `Ônibus até ${hubFrom.toUpperCase()}`, amount: money(result.combo.ground) },
      {
        label: `Voo ${hubFrom.toUpperCase()} → ${destination.toUpperCase()}`,
        amount: money(result.combo.total - result.combo.ground),
        url: result.combo.link,
        source: 'Aviasales',
      },
    ]);
    setAdded('combo');
  };
  const winner =
    result?.direct && result?.combo ? (result.combo.total < result.direct.total ? 'combo' : 'direct') : null;

  return (
    <section className="combo-card">
      <h3>
        <Route size={18} aria-hidden="true" /> Comparar combos
      </h3>
      <p className="flights-note">
        Ex.: sair direto do Rio ou pegar um ônibus até São Paulo e voar de lá. Informe o preço do ônibus; os voos
        vêm do cache de preços.
      </p>
      <form onSubmit={submit} className="flights-form">
        <label>
          Destino (IATA)
          <input value={form.destination} onChange={set('destination')} placeholder="LIS" maxLength={3} required />
        </label>
        <label>
          Sair direto de
          <input value={form.directFrom} onChange={set('directFrom')} placeholder="GIG" maxLength={3} required />
        </label>
        <label>
          Ou ir de ônibus até
          <input value={form.hubFrom} onChange={set('hubFrom')} placeholder="GRU" maxLength={3} required />
        </label>
        <label>
          Ônibus, por pessoa (R$)
          <input inputMode="decimal" value={form.ground} onChange={set('ground')} placeholder="120" required />
        </label>
        <label>
          Mês
          <input type="month" value={form.month} onChange={set('month')} />
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
          {state.status === 'loading' ? 'Comparando…' : 'Comparar'}
        </button>
      </form>
      {state.status === 'error' && <p role="alert">{state.error}</p>}
      {result && (
        <div className="combo-results">
          <ComboRow
            title={`Direto de ${form.directFrom.toUpperCase()}`}
            row={result.direct}
            best={winner === 'direct'}
            onUse={onUseInPlan && result.direct ? useDirect : null}
            used={added === 'direct'}
            lines={result.direct && [`Voo: ${brl(result.direct.total)}`]}
          />
          <ComboRow
            title={`Ônibus + voo de ${form.hubFrom.toUpperCase()}`}
            row={result.combo}
            best={winner === 'combo'}
            onUse={onUseInPlan && result.combo ? useCombo : null}
            used={added === 'combo'}
            lines={
              result.combo && [`Voo: ${brl(result.combo.total - result.combo.ground)}`, `Ônibus: ${brl(result.combo.ground)}`]
            }
          />
          {winner && (
            <p>
              <b>{winner === 'combo' ? 'O combo' : 'O voo direto'}</b> sai{' '}
              {brl(Math.abs(result.combo.total - result.direct.total))} mais barato.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ComboRow({ title, row, best, lines, onUse, used }) {
  return (
    <div className={`combo-row${best ? ' best' : ''}`}>
      <h4>
        {title} {best && <em>mais barato</em>}
      </h4>
      {row ? (
        <>
          {lines.map((l) => (
            <span key={l}>{l}</span>
          ))}
          <b>Total: {brl(row.total)}</b>
          <a href={row.link} target="_blank" rel="noopener noreferrer sponsored">
            Ver esse voo
          </a>
          {onUse && (
            <button type="button" className="btn-primary" onClick={onUse} disabled={used}>
              {used ? 'Adicionado ao plano ✓' : 'Usar no plano'}
            </button>
          )}
        </>
      ) : (
        <span>Sem preço guardado para essa rota.</span>
      )}
    </div>
  );
}
