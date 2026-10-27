import { Bookmark, Heart, MapPin, Plus } from 'lucide-react';
import { useState } from 'react';
import { posts as demoPosts } from '../data/posts.js';
import { hasBackend, supabase } from '../api/supabase.js';
import { usePosts } from '../hooks/usePosts.js';
import { useSession } from '../hooks/useSession.js';
import { AuthPanel, Composer } from '../components/CommunityPanels.jsx';

function timeAgo(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function Community({ onNewPost, onSavePost }) {
  const session = useSession();
  const live = usePosts();
  const [panel, setPanel] = useState(null);

  // Com backend: feed real. Sem backend (ou se falhar): exemplos de interface.
  const isLive = hasBackend && live.status === 'ready';
  const items = isLive
    ? live.posts.map((p) => ({
        key: p.id,
        id: p.id,
        initials: p.author_name.slice(0, 2).toUpperCase(),
        name: p.author_name,
        time: timeAgo(p.created_at),
        title: p.title,
        text: p.body,
        type: p.type,
        mine: session?.user.id === p.user_id,
      }))
    : demoPosts.map((p) => ({ ...p, key: p.title }));

  const newPost = () => {
    if (!hasBackend) return onNewPost();
    setPanel(session ? 'compose' : 'auth');
  };

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
          <p>
            {hasBackend
              ? 'Compartilhe um relato e ajude outra pessoa a viajar melhor.'
              : 'Em breve, você poderá compartilhar relatos e ajudar outra pessoa a viajar melhor.'}
          </p>
        </div>
        <button className="btn-dark" onClick={newPost}>
          <Plus size={17} aria-hidden="true" /> Novo relato
        </button>
      </div>

      {panel === 'auth' && <AuthPanel onDone={() => setPanel('compose')} />}
      {panel === 'compose' && session && (
        <Composer onSubmit={(f) => live.publish(session, f)} onDone={() => setPanel(null)} />
      )}
      {hasBackend && session && (
        <button className="post-remove" onClick={() => supabase.auth.signOut()}>
          Sair ({session.user.email})
        </button>
      )}
      {hasBackend && live.status === 'error' && (
        <p className="data-note">Não foi possível carregar os relatos agora. Mostrando exemplos.</p>
      )}

      <div className="community-feed">
        {items.map((p) => (
          <article className="community-post" key={p.key}>
            <div className="post-author">
              <span className="avatar" aria-hidden="true">
                {p.initials}
              </span>
              <div>
                <b>{p.name}</b>
                <small>{p.time}{isLive ? '' : ' · exemplo de conteúdo'}</small>
              </div>
              {p.mine && (
                <button className="post-remove" onClick={() => live.remove(p.id)}>
                  Apagar
                </button>
              )}
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

      {!isLive && (
        <p className="data-note">
          Os relatos exibidos são exemplos de interface, não depoimentos verificados de pessoas reais.
        </p>
      )}
    </section>
  );
}
