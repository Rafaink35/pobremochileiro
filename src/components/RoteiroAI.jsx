import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { supabase, hasBackend } from '../api/supabase.js';
import { parseBRL } from '../api/fx.js';

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const FITS = {
  sim: 'Cabe no orçamento (todos os valores estão confirmados).',
  nao: 'Já passa do orçamento, mesmo contando só o que foi confirmado.',
  indefinido: 'Ainda não dá para dizer se cabe: faltam valores.',
};

// Assistente de roteiro (IA no servidor). Só mostra valores confirmados por fontes consultadas.
export function RoteiroAI({ draft, onUseInPlan }) {
  const [form, setForm] = useState({ destination: '', origin: '', days: draft.days || '', adults: '1', month: '', notes: '' });
  const [state, setState] = useState({ status: 'idle', error: '', data: null });
  const [added, setAdded] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setAdded(false);
    setState({ status: 'loading', error: '', data: null });
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Entre na sua conta (aba Comunidade) para usar o assistente.');
      const budget = parseBRL(draft.budget ?? '');
      const res = await fetch('/api/roteiro', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, days: Number(form.days) || undefined, adults: Number(form.adults), budget: Number.isFinite(budget) ? budget : undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `erro ${res.status}`);
      setState({ status: 'done', error: '', data: body.roteiro });
    } catch (err) {
      setState({ status: 'error', error: err.message, data: null });
    }
  };

  const r = state.data;
  const usable = r?.items.filter((it) => it.verified && it.amount !== null) ?? [];

  return (
    <section className="roteiro-ai">
      <h3>
        <Sparkles size={18} aria-hidden="true" /> Roteiro mais barato com IA
      </h3>
      {!hasBackend ? (
        <p role="status">O assistente exige login e o banco de dados (Supabase) configurados, e eles ainda não estão.</p>
      ) : (
        <>
          <p className="flights-note">
            A IA monta o roteiro só com dados que consulta (voos, campings, trabalho em troca, câmbio). Valores sem fonte
            são descartados. Ela pode errar: confira antes de comprar.
          </p>
          <form onSubmit={submit} className="flights-form">
            <label>Destino<input value={form.destination} onChange={set('destination')} required placeholder="Ex.: Bogotá (BOG)" /></label>
            <label>Origem<input value={form.origin} onChange={set('origin')} placeholder="Ex.: GRU" /></label>
            <label>Dias<input inputMode="numeric" value={form.days} onChange={set('days')} /></label>
            <label>Passageiros
              <select value={form.adults} onChange={set('adults')}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <label>Mês<input type="month" value={form.month} onChange={set('month')} /></label>
            <label>Preferências<input value={form.notes} onChange={set('notes')} placeholder="Ex.: acampar, sem pressa" /></label>
            <button className="btn-primary" type="submit" disabled={state.status === 'loading'}>
              {state.status === 'loading' ? 'Montando…' : 'Montar roteiro'}
            </button>
          </form>
          {state.status === 'error' && <p role="alert">{state.error}</p>}
          {r && (
            <div className="roteiro-result">
              {r.summary && <p>{r.summary}</p>}
              <ul className="flex-list">
                {r.items.map((it) => (
                  <li key={it.id}>
                    <span><b>{it.category}</b> · {it.label}</span>
                    <strong>{it.amount !== null ? brl(it.amount) : 'valor não confirmado'}</strong>
                    {it.note && <small>{it.note}</small>}
                    {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer sponsored">Fonte: {it.sourceName ?? 'ver'}</a>}
                  </li>
                ))}
              </ul>
              <p role="status"><b>Total confirmado: {brl(r.knownTotal)}</b>. {FITS[r.fits]}</p>
              {r.missing.length > 0 && <p className="flights-note">Faltando: {r.missing.join('; ')}.</p>}
              {r.warnings.map((w) => <p key={w} className="flights-note">{w}</p>)}
              {usable.length > 0 && (
                <button
                  className="btn-outline"
                  disabled={added}
                  onClick={() => {
                    onUseInPlan(usable.map((it) => ({ category: it.category, label: it.label, amount: it.amount.toFixed(2).replace('.', ','), url: it.url ?? '', source: it.sourceName ?? 'fonte' })));
                    setAdded(true);
                  }}
                >
                  {added ? 'Adicionado ao plano ✓' : 'Adicionar itens confirmados ao plano'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
