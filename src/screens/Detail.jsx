import { ArrowUpRight, Compass, Heart, MapPin } from 'lucide-react';
import { BeforeTrip } from '../components/BeforeTrip.jsx';

export function Detail({ destination, isSaved, onBack, onToggleSave, onPlanTrip }) {
  return (
    <section className="page-section detail-page">
      <button className="back-link" onClick={onBack}>
        ← Voltar para explorar
      </button>

      <div
        className="detail-hero"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(5,35,27,.85),rgba(5,35,27,.15)),url(https://images.unsplash.com/${destination.image}?auto=format&fit=crop&w=1400&q=85)`,
        }}
      >
        <span className="hero-pill">{destination.tag}</span>
        <h1>{destination.name}</h1>
        <p>{destination.description}</p>
        <span className="detail-label">
          <MapPin size={15} aria-hidden="true" />
          {destination.region}
        </span>
      </div>

      <div className="detail-columns">
        <article className="paper-card">
          <p className="eyebrow">ANTES DE IR</p>
          <h2>Um bom rolê começa com informação.</h2>
          <ul className="check-list">
            <li>Confira clima e condições locais antes de sair.</li>
            <li>Verifique horários, regras e acessibilidade com fontes oficiais.</li>
            <li>Pesquise transporte e hospedagem para as suas datas.</li>
            <li>Reserve uma margem no orçamento para imprevistos.</li>
          </ul>
          <button className="btn-primary" onClick={() => onPlanTrip(destination)}>
            Planejar essa viagem <ArrowUpRight size={17} aria-hidden="true" />
          </button>
        </article>

        <article className="paper-card pale-card">
          <div className="detail-icon" aria-hidden="true">
            <Compass size={24} />
          </div>
          <h3>Falta descobrir os detalhes?</h3>
          <p>
            Esta página é uma inspiração de destino. Não há preço, distância ou disponibilidade
            confirmados nesta versão.
          </p>
          <button
            className="btn-outline"
            onClick={() => onToggleSave(destination.id)}
            aria-pressed={isSaved}
          >
            {isSaved ? 'Remover dos salvos' : 'Salvar ideia'} <Heart size={16} aria-hidden="true" />
          </button>
        </article>
      </div>

      <BeforeTrip />
    </section>
  );
}
