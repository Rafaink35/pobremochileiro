import { Bookmark, Heart, MapPin, Plus } from 'lucide-react';
import { posts } from '../data/posts.js';

export function Community({ onNewPost, onSavePost }) {
  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">DIÁRIO COLETIVO DE ESTRADA</p>
          <h1>
            Quem foi, <span>conta.</span>
          </h1>
          <p className="section-subtitle">Dicas úteis, experiências e aprendizados de viajantes.</p>
        </div>
        <div className="page-doodle" aria-hidden="true">
          ✎<small>ANOTA AÍ</small>
        </div>
      </div>

      <div className="community-callout">
        <div className="community-scribble" aria-hidden="true">
          ✳
        </div>
        <div>
          <h2>Todo mundo tem uma dica boa.</h2>
          <p>Em breve, você poderá compartilhar relatos e ajudar outra pessoa a viajar melhor.</p>
        </div>
        <button className="btn-dark" onClick={onNewPost}>
          <Plus size={17} aria-hidden="true" /> Novo relato
        </button>
      </div>

      <div className="community-feed">
        {posts.map((p) => (
          <article className="community-post" key={p.title}>
            <div className="post-author">
              <span className="avatar" aria-hidden="true">
                {p.initials}
              </span>
              <div>
                <b>{p.name}</b>
                <small>{p.time} · exemplo de conteúdo</small>
              </div>
              <button className="icon-button post-save" onClick={onSavePost} aria-label="Salvar relato">
                <Bookmark size={18} aria-hidden="true" />
              </button>
            </div>
            <span className="feed-tag">{p.type}</span>
            <h2>{p.title}</h2>
            <p>{p.text}</p>
            <div className="post-footer">
              <span>
                <Heart size={16} aria-hidden="true" /> Dica útil
              </span>
              <span>
                <MapPin size={16} aria-hidden="true" /> Experiência compartilhada
              </span>
            </div>
          </article>
        ))}
      </div>

      <p className="data-note">
        Os relatos exibidos são exemplos de interface, não depoimentos verificados de pessoas reais.
      </p>
    </section>
  );
}
