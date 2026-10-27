import { Heart } from 'lucide-react';
import { DestinationCard } from '../components/DestinationCard.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { destinations } from '../data/destinations.js';

export function Saved({ saved, onOpenDestination, onToggleSave, onNavigate }) {
  const savedDestinations = destinations.filter((d) => saved.includes(d.id));

  return (
    <section className="page-section">
      <p className="eyebrow">SUA LISTA DE DESEJOS</p>
      <h1>
        Ideias para <span>guardar.</span>
      </h1>
      <p className="section-subtitle">Os destinos que você marcou com coração aparecem aqui.</p>

      {savedDestinations.length ? (
        <div className="destination-grid explore-grid">
          {savedDestinations.map((d) => (
            <DestinationCard
              key={d.id}
              destination={d}
              isSaved
              onOpen={onOpenDestination}
              onToggleSave={onToggleSave}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Heart}
          title="Nenhuma ideia salva ainda."
          description="Encontre um destino que tenha a sua cara e toque no coração."
          action={
            <button className="btn-primary" onClick={() => onNavigate('Explorar')}>
              Explorar destinos
            </button>
          }
        />
      )}
    </section>
  );
}
