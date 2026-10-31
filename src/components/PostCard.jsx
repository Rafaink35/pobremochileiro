import { useEffect, useState } from 'react';
import { Flag, Heart, Lightbulb, MapPin, MessageCircle, Trash2 } from 'lucide-react';
import { costLabel } from '../services/community/postModel.js';
import { supabase } from '../api/supabase.js';

const day = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

function Comments({ postId, session, profile, onNeedProfile }) {
  const [items, setItems] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const { data, error: err } = await supabase
      .from('post_comments')
      .select('id,user_id,author_name,body,created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(100);
    if (err) setError('Não foi possível carregar os comentários.');
    else setItems(data);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const send = async (e) => {
    e.preventDefault();
    setError('');
    const body = text.trim();
    if (!body) return;
    const { error: err } = await supabase
      .from('post_comments')
      .insert({ post_id: postId, user_id: session.user.id, body });
    if (err) return setError('Não foi possível comentar agora.');
    setText('');
    await load();
  };
  const remove = async (id) => {
    await supabase.from('post_comments').delete().eq('id', id);
    await load();
  };

  return (
    <div className="post-comments">
      {items?.length === 0 && <p className="data-note">Nenhum comentário ainda.</p>}
      <ul>
        {(items ?? []).map((c) => (
          <li key={c.id}>
            <b>{c.author_name}</b> {c.body}
            {session?.user.id === c.user_id && (
              <button className="post-remove" onClick={() => remove(c.id)} aria-label="Apagar comentário">Apagar</button>
            )}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="form-error">{error}</p>}
      {session && !profile ? (
        <p className="data-note">
          Crie seu perfil para comentar. <button className="post-remove" onClick={onNeedProfile}>Criar perfil</button>
        </p>
      ) : session ? (
        <form onSubmit={send} className="chat-form">
          <label className="sr-only" htmlFor={`c-${postId}`}>Comentário</label>
          <input id={`c-${postId}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Escreva um comentário" />
          <button className="btn-outline" disabled={!text.trim()}>Comentar</button>
        </form>
      ) : (
        <p className="data-note">Entre na sua conta para comentar.</p>
      )}
    </div>
  );
}

// Relato no estilo feed: fotos, texto, dica útil, curtir, comentar e denunciar.
export function PostCard({ post, session, profile, actions, onNeedLogin, onNeedProfile }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const mine = session?.user.id === post.userId;
  const guard = (fn) => async () => {
    if (!session) return onNeedLogin();
    setMsg('');
    try {
      await fn();
    } catch {
      setMsg('Não foi possível concluir agora.');
    }
  };
  const cost = costLabel(post);

  return (
    <article className="community-post insta-post">
      <div className="post-author">
        <span className="avatar" aria-hidden="true">{post.author.slice(0, 2).toUpperCase()}</span>
        <div>
          <b>{post.author}</b>
          <small>{day(post.createdAt)}{post.place ? ` · ${post.place}` : ''}</small>
        </div>
        {mine && (
          <button className="post-remove" onClick={guard(() => actions.remove(post.id))} aria-label="Apagar relato">
            <Trash2 size={14} aria-hidden="true" /> Apagar
          </button>
        )}
      </div>

      {post.images.length > 0 && (
        <div className="post-images" role="group" aria-label={`Fotos de ${post.title}`}>
          {post.images.map((src, i) => (
            <img key={src} src={src} alt={`${post.title} (foto ${i + 1} de ${post.images.length})`} loading="lazy" />
          ))}
        </div>
      )}

      <div className="post-actions">
        <button className={'icon-button like' + (post.liked ? ' on' : '')} aria-pressed={post.liked} aria-label={post.liked ? 'Descurtir' : 'Curtir'} onClick={guard(() => actions.toggleLike(post))}>
          <Heart size={20} aria-hidden="true" fill={post.liked ? 'currentColor' : 'none'} />
        </button>
        <span>{post.likes} {post.likes === 1 ? 'curtida' : 'curtidas'}</span>
        <button className="icon-button" aria-expanded={open} aria-label="Comentários" onClick={() => setOpen((v) => !v)}>
          <MessageCircle size={20} aria-hidden="true" />
        </button>
        {!mine && (
          <button className="icon-button" aria-label="Denunciar relato" onClick={guard(async () => { await actions.report(post.id); setMsg('Denúncia enviada. Obrigado.'); })}>
            <Flag size={18} aria-hidden="true" />
          </button>
        )}
      </div>

      <span className="feed-tag">{post.type}</span>
      {post.community && <span className="feed-tag community-tag">{post.community}</span>}
      <h2>{post.title}</h2>
      <p className="post-body">{post.body}</p>
      {post.tip && (
        <div className="post-tip">
          <Lightbulb size={16} aria-hidden="true" /> <span><b>Dica útil:</b> {post.tip}</span>
        </div>
      )}
      {cost && (
        <p className="post-cost">
          <MapPin size={14} aria-hidden="true" /> {cost}
        </p>
      )}
      {msg && <p role="status" className="data-note">{msg}</p>}
      {open && <Comments postId={post.id} session={session} profile={profile} onNeedProfile={onNeedProfile} />}
    </article>
  );
}
