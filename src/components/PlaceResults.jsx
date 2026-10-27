import { useEffect, useState } from 'react';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import { searchPlaces } from '../api/places.js';

// Resultados reais da Wikipédia para o termo digitado em Explorar.
export function PlaceResults({ query, onPlan }) {
  const term = query.trim();
  const [state, setState] = useState({ status: 'idle', places: [] });

  useEffect(() => {
    if (term.length < 3) {
      setState({ status: 'idle', places: [] });
      return undefined;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, status: 'loading' }));
    const t = setTimeout(() => {
      searchPlaces(term, ctrl.signal)
        .then((places) => setState({ status: 'ready', places }))
        .catch((e) => e.name !== 'AbortError' && setState({ status: 'error', places: [] }));
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [term]);

  if (state.status === 'idle') return null;

  return (
    <div className="places">
      <p className="eyebrow">LUGARES REAIS PARA “{term.toUpperCase()}”</p>
      {state.status === 'loading' && <p className="places-note">Procurando…</p>}
      {state.status === 'error' && (
        <p className="places-note">Não foi possível buscar lugares agora. Confira sua conexão e tente de novo.</p>
      )}
      {state.status === 'ready' && state.places.length === 0 && (
        <p className="places-note">Nenhum lugar encontrado para esse termo.</p>
      )}
      <div className="places-grid">
        {state.places.map((p) => (
          <article className="place-card" key={p.id}>
            {p.image && <img src={p.image} alt="" loading="lazy" />}
            <div>
              <h3>{p.title}</h3>
              <p>{p.extract}</p>
              <div className="place-actions">
                <button className="text-link" onClick={() => onPlan({ name: p.title })}>
                  Planejar <ArrowUpRight size={15} aria-hidden="true" />
                </button>
                <a className="text-link" href={p.url} target="_blank" rel="noreferrer">
                  Wikipédia <ExternalLink size={14} aria-hidden="true" />
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
      {state.status === 'ready' && <p className="data-note">Textos e fotos: Wikipédia (licenças livres).</p>}
    </div>
  );
}
