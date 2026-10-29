import { Sparkles, ArrowUpRight, ChevronRight, Wallet } from 'lucide-react';
import { BackpackMark } from '../components/BackpackMark.jsx';
import { DestinationCard } from '../components/DestinationCard.jsx';
import { destinations, categories } from '../data/destinations.js';
import { posts } from '../data/posts.js';

const CATEGORY_ICONS = { Todos: '✳', Praia: '☼', Natureza: '⌁', Cidade: '▦' };

export function Home({ onNavigate, onSelectCategory, onOpenDestination, saved, onToggleSave }) {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-pill">
            <Sparkles size={14} aria-hidden="true" /> VIAJAR BEM, GASTAR COM JUÍZO
          </span>
          <h1>
            Seu próximo rolê
            <br />
            começa <span>por aqui.</span>
          </h1>
          <p>
            Ideias de destinos, planejamento sem perrengue e dicas de quem já foi. O resto a gente
            descobre junto.
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={() => onNavigate('Explorar')}>
              Explorar destinos <ArrowUpRight size={17} aria-hidden="true" />
            </button>
            <button className="btn-quiet" onClick={() => onNavigate('Planejador')}>
              Planejar viagem <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
          <div className="hero-footnote">
            <span className="mini-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>Sem preços chutados. Só boas ideias.</span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="sun-shape" />
          <div className="route-line" />
          <span className="stamp stamp-one">VAI COM CALMA</span>
          <span className="stamp stamp-two">✳ PARTIU!</span>
          <div className="hero-backpack">
            <BackpackMark />
          </div>
          <span className="art-caption">
            carregando histórias
            <br />
            não boletos ✦
          </span>
          <span className="art-star">✳</span>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A CURIOSIDADE LEVA</p>
            <h2>Pra onde vamos?</h2>
            <p className="section-subtitle">Pistas para sua próxima aventura — escolha uma vibe.</p>
          </div>
          <button className="text-link desktop-link" onClick={() => onNavigate('Explorar')}>
            Ver todas <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="category-row" role="group" aria-label="Categorias de destino">
          {categories.map((c) => (
            <button key={c} className="category-chip" onClick={() => onSelectCategory(c)}>
              <span aria-hidden="true">{CATEGORY_ICONS[c]}</span>
              {c}
            </button>
          ))}
        </div>
        <div className="destination-grid">
          {destinations.slice(0, 3).map((d) => (
            <DestinationCard
              key={d.id}
              destination={d}
              isSaved={saved.includes(d.id)}
              onOpen={onOpenDestination}
              onToggleSave={onToggleSave}
            />
          ))}
        </div>
      </section>

      <section className="planner-banner">
        <div className="banner-icon" aria-hidden="true">
          <Sparkles size={24} />
        </div>
        <div>
          <p className="eyebrow">DINHEIRO CONTADO, SEM CHUTE</p>
          <h2>Descubra até onde seu dinheiro leva você.</h2>
          <p>Diga quanto tem e de onde sai. Mostramos só o que tem fonte e data.</p>
        </div>
        <button className="btn-dark" onClick={() => onNavigate('Descubra')}>
          Descobrir <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      </section>

      <section className="planner-banner">
        <div className="banner-icon" aria-hidden="true">
          <Wallet size={24} />
        </div>
        <div>
          <p className="eyebrow">O PLANO É NÃO SE ENROLAR</p>
          <h2>Seu dinheiro também vai viajar.</h2>
          <p>Monte uma estimativa de gastos antes de fazer as malas.</p>
        </div>
        <button className="btn-dark" onClick={() => onNavigate('Planejador')}>
          Montar meu plano <ArrowUpRight size={17} aria-hidden="true" />
        </button>
      </section>

      <section className="section-block community-preview">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GENTE QUE FOI E CONTA</p>
            <h2>O melhor mapa é compartilhado.</h2>
          </div>
          <button className="text-link desktop-link" onClick={() => onNavigate('Comunidade')}>
            Ver comunidade <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="post-grid">
          {posts.slice(0, 2).map((p) => (
            <article className="tip-card" key={p.title}>
              <div className="post-author">
                <span className="avatar" aria-hidden="true">
                  {p.initials}
                </span>
                <div>
                  <b>{p.name}</b>
                  <small>{p.time}</small>
                </div>
                <span className="post-type">{p.type}</span>
              </div>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
              <button className="text-link" onClick={() => onNavigate('Comunidade')}>
                Ler dica <ChevronRight size={15} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
