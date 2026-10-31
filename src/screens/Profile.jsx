import { useEffect, useState } from 'react';
import { supabase, hasBackend } from '../api/supabase.js';
import { Avatar, ProfileForm } from '../components/ProfileForm.jsx';
import { AuthPanel } from '../components/CommunityPanels.jsx';

export function Profile({ session, profileApi, onNavigate, notify }) {
  const { profile, status } = profileApi;
  const [editing, setEditing] = useState(false);
  const [mine, setMine] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase || !profile) return;
    supabase.from('posts').select('id,title,created_at,type').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setMine(data ?? []));
  }, [profile]);

  if (!hasBackend) {
    return <section className="page-section"><h1>Perfil</h1><p role="status">O perfil exige login e o banco de dados (Supabase), que ainda não estão configurados.</p></section>;
  }
  if (!session) {
    return (
      <section className="page-section">
        <h1>Seu perfil mochileiro</h1>
        <p>Entre para criar o seu perfil, publicar relatos e comentar.</p>
        <AuthPanel onDone={() => {}} />
      </section>
    );
  }
  if (status === 'loading') return <section className="page-section"><p role="status">Carregando seu perfil…</p></section>;
  if (status === 'error') return <section className="page-section"><p role="alert">Não foi possível carregar o perfil agora.</p></section>;

  if (!profile) {
    return (
      <section className="page-section">
        <h1>Bem-vindo(a)!</h1>
        <ProfileForm mode="create" onSubmit={async (f) => { await profileApi.save(f, { creating: true }); notify('Perfil criado.'); }} />
      </section>
    );
  }

  const remove = async () => {
    setError('');
    try {
      await profileApi.deleteAccount();
      notify('Sua conta foi apagada.');
      onNavigate('Início');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">SEU PERFIL</p>
          <h1>@{profile.username}</h1>
        </div>
        <Avatar profile={profile} size={72} />
      </div>

      {editing ? (
        <ProfileForm
          mode="edit"
          initial={profile}
          onSubmit={async (f) => { await profileApi.save(f, { creating: false }); setEditing(false); notify('Perfil atualizado.'); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="paper-card profile-card">
          {profile.displayName && <p><b>{profile.displayName}</b></p>}
          {profile.homeCity && <p>De {profile.homeCity}</p>}
          {profile.bio && <p>{profile.bio}</p>}
          {profile.travelStyles.length > 0 && <p>Estilo: {profile.travelStyles.join(', ')}</p>}
          <p className="data-note">{profile.isPublic ? 'Perfil público.' : 'Perfil privado: só o seu nome de usuário aparece nos relatos.'} O seu e-mail nunca aparece.</p>
          <div className="plan-add">
            <button className="btn-outline" onClick={() => setEditing(true)}>Editar perfil</button>
            <button className="btn-outline" onClick={() => supabase.auth.signOut()}>Sair</button>
          </div>
        </div>
      )}

      <h3>Meus relatos</h3>
      {mine === null ? <p role="status">Carregando…</p> : mine.length === 0 ? (
        <p className="data-note">Você ainda não publicou nenhum relato.</p>
      ) : (
        <ul className="flex-list">
          {mine.map((p) => (
            <li key={p.id}><span><b>{p.title}</b> · {p.type}</span><small>{new Date(p.created_at).toLocaleDateString('pt-BR')}</small></li>
          ))}
        </ul>
      )}

      <div className="paper-card danger-zone">
        <h3>Apagar minha conta</h3>
        <p className="data-note">Apaga seu perfil, relatos, fotos, curtidas e comentários. Não dá para desfazer.</p>
        {confirming ? (
          <div className="plan-add">
            <button className="btn-primary" onClick={remove}>Sim, apagar tudo</button>
            <button className="btn-outline" onClick={() => setConfirming(false)}>Cancelar</button>
          </div>
        ) : (
          <button className="btn-outline" onClick={() => setConfirming(true)}>Apagar minha conta</button>
        )}
        {error && <p role="alert" className="form-error">{error}</p>}
      </div>
    </section>
  );
}
