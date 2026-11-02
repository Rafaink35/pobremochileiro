import { useState } from 'react';
import { gtfsProvider } from '../services/transport/providerRegistry.js';
import { BRAZIL_FEEDS, loadBrazilFeed } from '../services/transport/brazilFeeds.js';

// Carrega os feeds GTFS brasileiros configurados no servidor. Fica só na memória deste navegador.
export function BrazilFeeds({ onLoaded }) {
  const [busy, setBusy] = useState(null);
  const [messages, setMessages] = useState({});

  const load = async (id) => {
    setBusy(id);
    const r = await loadBrazilFeed(id, gtfsProvider);
    setMessages((m) => ({ ...m, [id]: r }));
    setBusy(null);
    if (r.ok) onLoaded?.();
  };

  return (
    <div className="brazil-feeds">
      <p className="flights-note">
        Dados oficiais do Rio, de São Paulo e da ANTT, quando o servidor tiver o feed configurado. Sem configuração,
        nada é mostrado.
      </p>
      <ul className="flex-list">
        {BRAZIL_FEEDS.map((f) => (
          <li key={f.id}>
            <button className="btn-outline" onClick={() => load(f.id)} disabled={busy !== null}>
              {busy === f.id ? 'Carregando…' : `Carregar ${f.label}`}
            </button>
            {messages[f.id] && <small role="status">{messages[f.id].message}</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}
