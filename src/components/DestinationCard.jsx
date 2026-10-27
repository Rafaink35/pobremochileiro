import { ArrowUpRight, ChevronRight, Heart } from 'lucide-react';

// Card de destino — usado em Início, Explorar e Salvos.
// Conteúdo é inspiração visual: sem preço, nota ou disponibilidade reais.
export function DestinationCard({ destination, isSaved, onOpen, onToggleSave }) {
  return (
    <article className="destination-card">
      <button
        className="destination-photo"
        style={{
          backgroundImage: `linear-gradient(180deg,transparent 40%,rgba(5,35,27,.72)),url(https://images.unsplash.com/${destination.image}?auto=format&fit=crop&w=900&q=82)`,
        }}
        onClick={() => onOpen(destination)}
        aria-label={'Ver ' + destination.name}
      >
        <span className="photo-tag">{destination.tag}</span>
        <span className="photo-open" aria-hidden="true">
          <ArrowUpRight size={18} />
        </span>
      </button>
      <div className="destination-info">
        <div>
          <p className="eyebrow">{destination.region}</p>
          <h3>{destination.name}</h3>
        </div>
        <button
          className={'save-btn ' + (isSaved ? 'saved' : '')}
          onClick={() => onToggleSave(destination.id)}
          aria-pressed={isSaved}
          aria-label={isSaved ? `Remover ${destination.name} dos salvos` : `Salvar ${destination.name}`}
        >
          <Heart size={18} fill={isSaved ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
        <p className="destination-desc">{destination.description}</p>
        <button className="text-link" onClick={() => onOpen(destination)}>
          Explorar ideia <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}
