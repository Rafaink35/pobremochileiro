import { useState } from 'react';
import { supabase } from '../api/supabase.js';

const TYPES = ['Dica', 'Planejamento', 'Natureza', 'Cidade', 'Praia'];

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
  const [form, setForm] = useState({ type: TYPES[0], title: '', body: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit(form);
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
      <label htmlFor="post-type">
        Tipo
        <select id="post-type" value={form.type} onChange={set('type')}>
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label htmlFor="post-title">
        Título
        <input id="post-title" required minLength={3} maxLength={120} value={form.title} onChange={set('title')} />
      </label>
      <label htmlFor="post-body">
        Sua dica
        <textarea id="post-body" required minLength={3} maxLength={2000} rows={4} value={form.body} onChange={set('body')} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn-primary" disabled={busy}>
        Publicar
      </button>
    </form>
  );
}
