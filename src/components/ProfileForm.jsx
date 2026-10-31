import { useState } from 'react';
import { AVATAR_COLORS, MAX_STYLES, TRAVEL_STYLES, initials, suggestUsername, validateProfileForm } from '../services/profile/model.js';

export function Avatar({ profile, size = 44 }) {
  const color = AVATAR_COLORS[profile?.avatarColor ?? 'green'];
  const dark = ['green', 'coral'].includes(profile?.avatarColor ?? 'green');
  return (
    <span className="profile-avatar" aria-hidden="true" style={{ width: size, height: size, background: color, color: dark ? '#fff9ed' : '#0b3d2e', fontSize: size * 0.4 }}>
      {initials(profile)}
    </span>
  );
}

const EMPTY = { username: '', displayName: '', bio: '', homeCity: '', travelStyles: [], avatarColor: 'green', isPublic: true };

/** Criar (mode="create", pede o nome de usuário) ou editar (mode="edit") o perfil. */
export function ProfileForm({ mode = 'create', initial = null, onSubmit, onCancel }) {
  const creating = mode === 'create';
  const [form, setForm] = useState(() => (initial ? { ...EMPTY, ...initial } : { ...EMPTY, username: suggestUsername() }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleStyle = (s) =>
    setForm((f) => ({ ...f, travelStyles: f.travelStyles.includes(s) ? f.travelStyles.filter((x) => x !== s) : [...f.travelStyles, s] }));

  const submit = async (e) => {
    e.preventDefault();
    const problems = validateProfileForm(form, { creating });
    if (problems.length) return setError(problems[0]);
    setBusy(true);
    setError('');
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="side-panel profile-form" onSubmit={submit}>
      <h3>{creating ? 'Crie seu perfil mochileiro' : 'Editar perfil'}</h3>
      {creating && (
        <p className="data-note">
          Esse é o nome que as pessoas vão ver nos seus relatos e comentários. Seu e-mail <b>nunca</b> aparece.
        </p>
      )}
      <div className="profile-preview">
        <Avatar profile={form} size={56} />
        <span>@{form.username || 'seu_nome'}</span>
      </div>
      {creating && (
        <label htmlFor="pf-username">
          Nome de usuário
          <input id="pf-username" value={form.username} onChange={set('username')} maxLength={20} autoCapitalize="none" spellCheck={false} />
        </label>
      )}
      <label htmlFor="pf-display">
        Nome de exibição (opcional)
        <input id="pf-display" value={form.displayName} onChange={set('displayName')} maxLength={40} />
      </label>
      <label htmlFor="pf-city">
        Cidade de origem (opcional)
        <input id="pf-city" value={form.homeCity} onChange={set('homeCity')} maxLength={60} />
      </label>
      <label htmlFor="pf-bio">
        Bio (opcional, até 160 caracteres)
        <textarea id="pf-bio" rows={2} value={form.bio} onChange={set('bio')} maxLength={160} />
      </label>
      <fieldset className="trip-prefs">
        <legend>Estilo de viagem (até {MAX_STYLES})</legend>
        {TRAVEL_STYLES.map((s) => (
          <label key={s} className="check">
            <input type="checkbox" checked={form.travelStyles.includes(s)} onChange={() => toggleStyle(s)} /> {s}
          </label>
        ))}
      </fieldset>
      <fieldset className="trip-prefs">
        <legend>Cor do seu avatar</legend>
        {Object.keys(AVATAR_COLORS).map((c) => (
          <label key={c} className="check">
            <input type="radio" name="avatar-color" checked={form.avatarColor === c} onChange={() => setForm((f) => ({ ...f, avatarColor: c }))} />
            <span className="swatch" style={{ background: AVATAR_COLORS[c] }} aria-label={c} />
          </label>
        ))}
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm((f) => ({ ...f, isPublic: e.target.checked }))} />
        Perfil público (nome de usuário, bio, cidade e estilos). Se desmarcar, só o seu nome de usuário aparece nos relatos.
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="plan-add">
        <button className="btn-primary" disabled={busy}>{busy ? 'Salvando…' : creating ? 'Criar perfil' : 'Salvar'}</button>
        {onCancel && <button type="button" className="btn-outline" onClick={onCancel}>Cancelar</button>}
      </div>
    </form>
  );
}
