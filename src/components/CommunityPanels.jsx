import { useState } from 'react';
import { supabase } from '../api/supabase.js';
import { MAX_IMAGES, compressImage, validateImageFile } from '../services/community/images.js';
import { POST_TYPES, validatePostDraft } from '../services/community/postModel.js';

// Login por código de 6 dígitos enviado por e-mail (sem senha).
export function AuthPanel({ onDone }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message || 'Algo deu errado. Tente de novo.');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = (e) => {
    e.preventDefault();
    run(async () => {
      const { error: err } = await supabase.auth.signInWithOtp({ email: email.trim() });
      if (err) throw err;
      setStep('code');
    });
  };

  const verify = (e) => {
    e.preventDefault();
    run(async () => {
      const { error: err } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
      if (err) throw err;
      onDone();
    });
  };

  return (
    <form className="side-panel" onSubmit={step === 'email' ? sendCode : verify}>
      <h3>Entrar para publicar</h3>
      {step === 'email' ? (
        <label htmlFor="auth-email">
          Seu e-mail
          <input id="auth-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      ) : (
        <label htmlFor="auth-code">
          Código enviado para {email}
          <input
            id="auth-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn-primary" disabled={busy}>
        {step === 'email' ? 'Receber código' : 'Entrar'}
      </button>
    </form>
  );
}

export function Composer({ onSubmit, onDone }) {
  const [form, setForm] = useState({ type: POST_TYPES[0], title: '', body: '', place: '', tip: '', costBRL: '', days: '' });
  const [files, setFiles] = useState([]); // { id, blob, preview }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addFiles = async (e) => {
    const chosen = [...e.target.files];
    e.target.value = '';
    setError('');
    let count = files.length;
    const added = [];
    for (const file of chosen) {
      const problem = validateImageFile(file, count);
      if (problem) {
        setError(problem);
        break;
      }
      try {
        const blob = await compressImage(file);
        added.push({ id: `${file.name}-${count}-${blob.size}`, blob, preview: URL.createObjectURL(blob) });
        count += 1;
      } catch (err) {
        setError(err.message);
        break;
      }
    }
    setFiles((old) => [...old, ...added]);
  };
  const removeFile = (id) =>
    setFiles((old) => {
      old.filter((f) => f.id === id).forEach((f) => URL.revokeObjectURL(f.preview));
      return old.filter((f) => f.id !== id);
    });

  const submit = async (e) => {
    e.preventDefault();
    const problems = validatePostDraft(form, files.length);
    if (problems.length) return setError(problems[0]);
    setBusy(true);
    setError('');
    try {
      await onSubmit(form, files.map((f) => f.blob));
      files.forEach((f) => URL.revokeObjectURL(f.preview));
      onDone();
    } catch (err) {
      setError(err.message || 'Não foi possível publicar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="side-panel" onSubmit={submit}>
      <h3>Novo relato</h3>
      <label htmlFor="post-photos">
        Fotos (até {MAX_IMAGES})
        <input id="post-photos" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} disabled={files.length >= MAX_IMAGES} />
      </label>
      {files.length > 0 && (
        <div className="composer-previews">
          {files.map((f, i) => (
            <figure key={f.id}>
              <img src={f.preview} alt={`Prévia da foto ${i + 1}`} />
              <button type="button" className="post-remove" onClick={() => removeFile(f.id)}>Remover</button>
            </figure>
          ))}
        </div>
      )}
      <p className="data-note">
        As fotos são reduzidas e perdem os dados de localização do arquivo. Não publique documentos, cartões nem fotos de
        pessoas sem a permissão delas.
      </p>
      <label htmlFor="post-type">
        Tipo
        <select id="post-type" value={form.type} onChange={set('type')}>
          {POST_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label htmlFor="post-title">
        Título
        <input id="post-title" required minLength={3} maxLength={120} value={form.title} onChange={set('title')} />
      </label>
      <label htmlFor="post-body">
        Seu relato
        <textarea id="post-body" required minLength={3} maxLength={2000} rows={4} value={form.body} onChange={set('body')} />
      </label>
      <label htmlFor="post-place">
        Lugar (opcional)
        <input id="post-place" maxLength={80} value={form.place} onChange={set('place')} placeholder="Ex.: Paraty, RJ" />
      </label>
      <label htmlFor="post-tip">
        Dica útil (opcional)
        <textarea id="post-tip" maxLength={500} rows={2} value={form.tip} onChange={set('tip')} placeholder="O que você diria para quem vai?" />
      </label>
      <div className="form-two">
        <label htmlFor="post-cost">
          Quanto gastou (R$, opcional)
          <input id="post-cost" inputMode="decimal" value={form.costBRL} onChange={set('costBRL')} />
        </label>
        <label htmlFor="post-days">
          Dias (opcional)
          <input id="post-days" inputMode="numeric" value={form.days} onChange={set('days')} />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn-primary" disabled={busy}>
        {busy ? 'Publicando…' : 'Publicar'}
      </button>
    </form>
  );
}
