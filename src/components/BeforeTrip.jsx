import { ArrowUpRight } from 'lucide-react';
import { partners } from '../data/partners.js';

export function BeforeTrip() {
  const items = partners.filter((p) => p.url.startsWith('https://'));
  if (items.length === 0) return null;
  return (
    <section className="before-trip">
      <h3>Antes de viajar</h3>
      <div className="before-trip-grid">
        {items.map((p) => (
          <a key={p.id} className="before-trip-card" href={p.url} target="_blank" rel="noopener noreferrer sponsored">
            <b>{p.title}</b>
            <span>{p.text}</span>
            <em>
              {p.name} <ArrowUpRight size={14} aria-hidden="true" />
            </em>
          </a>
        ))}
      </div>
      <p className="flights-note">Links de afiliado: o Pobre Mochileiro pode receber uma comissão, sem custo extra para você.</p>
    </section>
  );
}
