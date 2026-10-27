import { useEffect, useState } from 'react';
import { fetchRates, parseBRL } from '../api/fx.js';

// Converte o limite do Planejador para outras moedas com câmbio de referência.
export function FxCard({ budget }) {
  const [state, setState] = useState({ status: 'loading' });
  const [code, setCode] = useState('USD');

  useEffect(() => {
    fetchRates()
      .then((d) => setState({ status: 'ready', ...d }))
      .catch(() => setState({ status: 'error' }));
  }, []);

  if (state.status === 'loading') return <p className="summary-warning">Buscando câmbio…</p>;
  if (state.status === 'error')
    return <p className="summary-warning">Câmbio indisponível agora. O rascunho continua funcionando.</p>;

  const codes = Object.keys(state.rates);
  const amount = parseBRL(budget);
  const rate = state.rates[code];
  const shown = Number.isFinite(amount) && rate
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code }).format(amount / rate)
    : '—';

  return (
    <div className="fx-card">
      <label htmlFor="fx-code">Equivale a</label>
      <div className="fx-row">
        <strong>{shown}</strong>
        <select id="fx-code" value={code} onChange={(e) => setCode(e.target.value)}>
          {codes.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <small>
        Câmbio de referência (AwesomeAPI){state.updatedAt ? `, ${state.updatedAt}` : ''}. Não inclui taxas nem IOF.
      </small>
    </div>
  );
}
