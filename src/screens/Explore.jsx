import { Search, SlidersHorizontal, Compass } from 'lucide-react';
import { DestinationCard } from '../components/DestinationCard.jsx';
import { PlaceResults } from '../components/PlaceResults.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { destinations, categories } from '../data/destinations.js';

export function Explore({
  query,
  setQuery,
  category,
  setCategory,
  saved,
  onOpenDestination,
  onToggleSave,
  onPlanPlace,
}) {
  const filtered = destinations.filter(
    (d) =>
      (category === 'Todos' || d.category === category) &&
      `${d.name} ${d.region} ${d.description}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">ABRA O MAPA</p>
          <h1>
            Ideias que dão <span>vontade de ir.</span>
          </h1>
          <p className="section-subtitle">Explore por paisagem, clima ou vontade de sumir um pouquinho.</p>
        </div>
        <div className="page-doodle" aria-hidden="true">
          ✳<small>PARTIU?</small>
        </div>
      </div>

      <div className="search-panel">
        <Search size={20} aria-hidden="true" />
        <label htmlFor="explore-search" className="sr-only">
          Buscar destinos
        </label>
        <input
          id="explore-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busque praias, trilhas, cidades..."
          type="search"
        />
        <SlidersHorizontal size={19} aria-hidden="true" />
      </div>

      <div className="filter-row" role="group" aria-label="Filtrar por categoria">
        {categories.map((c) => (
          <button
            key={c}
            className={'filter-chip ' + (category === c ? 'selected' : '')}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="destination-grid explore-grid">
        {filtered.map((d) => (
          <DestinationCard
            key={d.id}
            destination={d}
            isSaved={saved.includes(d.id)}
            onOpen={onOpenDestination}
            onToggleSave={onToggleSave}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          icon={Compass}
          title="Essa trilha ainda não apareceu."
          description="Tente outro termo ou limpe os filtros."
          action={
            <button
              className="btn-primary"
              onClick={() => {
                setQuery('');
                setCategory('Todos');
              }}
            >
              Limpar filtros
            </button>
          }
        />
      )}

      <PlaceResults query={query} onPlan={onPlanPlace} />

      <p className="data-note">
        As imagens e categorias são inspiração visual. Preços e disponibilidade não estão sendo
        apresentados como dados reais.
      </p>
    </section>
  );
}
