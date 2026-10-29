import { useRef, useState } from 'react';
import { MessageCircle, Plus, Send } from 'lucide-react';
import { supabase, hasBackend } from '../api/supabase.js';
import { applyChatEvent, emptyAssistantState, readNdjson } from '../services/chat/ndjson.js';

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const SUGGESTIONS = [
  'Tenho R$ 3 mil e 15 dias. Para onde dá para ir?',
  'Qual o jeito mais barato de ir de GRU para Bogotá em janeiro?',
  'Meu plano cabe no orçamento? O que falta?',
];

function planForServer(draft) {
  return {
    budget: draft.budget ?? '',
    items: (draft.items ?? []).map(({ category, label, amount }) => ({ category, label, amount })),
    stays: (draft.stays ?? []).map((s) => ({ name: s.name, kind: s.kind, cost: { status: s.cost.status }, transport: { status: s.transport.status } })),
  };
}

// Chat com o assistente (streaming). Valores só entram no plano se confirmados por fonte e se o usuário escolher.
export function ChatAgent({ draft, onUseInPlan }) {
  const [turns, setTurns] = useState([]); // { role: 'user', content } | { role: 'assistant', ...estado }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addedIds, setAddedIds] = useState(() => new Set());
  const endRef = useRef(null);

  const patchLast = (fn) => setTurns((t) => [...t.slice(0, -1), fn(t.at(-1))]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || busy) return;
    setError('');
    setBusy(true);
    const history = [...turns.map((t) => ({ role: t.role, content: t.role === 'user' ? t.content : t.text })), { role: 'user', content }].filter((m) => m.content);
    setTurns((t) => [...t, { role: 'user', content }, { role: 'assistant', ...emptyAssistantState() }]);
    setInput('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Entre na sua conta (aba Comunidade) para usar o assistente.');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: history, plan: planForServer(draft) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `erro ${res.status}`);
      for await (const event of readNdjson(res.body)) {
        patchLast((last) => applyChatEvent(last, event));
        endRef.current?.scrollIntoView?.({ block: 'end' });
      }
    } catch (err) {
      setError(err.message);
      setTurns((t) => (t.at(-1)?.role === 'assistant' && !t.at(-1).text ? t.slice(0, -1) : t));
    } finally {
      setBusy(false);
    }
  };

  const addItems = (items) => {
    const usable = items.filter((it) => it.verified && it.amount !== null && !addedIds.has(it.id + it.label));
    if (!usable.length) return;
    onUseInPlan(
      usable.map((it) => ({ category: it.category, label: it.label, amount: it.amount.toFixed(2).replace('.', ','), url: it.url ?? '', source: it.sourceName ?? 'fonte' })),
    );
    setAddedIds((old) => new Set([...old, ...usable.map((it) => it.id + it.label)]));
  };

  return (
    <section className="chat-agent">
      <h3>
        <MessageCircle size={18} aria-hidden="true" /> Converse com o assistente
      </h3>
      {!hasBackend ? (
        <p role="status">O assistente exige login e o banco de dados (Supabase) configurados, e eles ainda não estão.</p>
      ) : (
        <>
          <p className="flights-note">
            Ele consulta voos, datas, campings, trabalho em troca e o seu plano. Só valores confirmados por fonte entram no
            plano, e você escolhe o que adicionar. A IA pode errar: confira antes de comprar.
          </p>
          {turns.length === 0 && (
            <div className="plan-add">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="btn-outline" onClick={() => send(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="chat-log" aria-live="polite">
            {turns.map((t, i) =>
              t.role === 'user' ? (
                <p key={i} className="chat-user">{t.content}</p>
              ) : (
                <div key={i} className="chat-assistant">
                  {t.text && <p className="chat-text">{t.text}</p>}
                  {t.status && <p role="status" className="flights-note">{t.status}</p>}
                  {t.warning && <p role="alert" className="chat-warning">{t.warning}</p>}
                  {t.error && <p role="alert">{t.error}</p>}
                  {t.proposals.length > 0 && (
                    <div className="chat-proposals">
                      <b>Sugestões para o plano</b>
                      <ul className="flex-list">
                        {t.proposals.map((it, k) => (
                          <li key={`${it.id}-${k}`}>
                            <span><b>{it.category}</b> · {it.label}</span>
                            <strong>{it.amount !== null ? brl(it.amount) : 'valor não confirmado'}</strong>
                            {it.note && <small>{it.note}</small>}
                            {it.url && <a href={it.url} target="_blank" rel="noopener noreferrer sponsored">Fonte: {it.sourceName ?? 'ver'}</a>}
                            {it.verified && it.amount !== null && (
                              <button type="button" className="btn-outline" onClick={() => addItems([it])} disabled={addedIds.has(it.id + it.label)}>
                                <Plus size={13} aria-hidden="true" /> {addedIds.has(it.id + it.label) ? 'No plano ✓' : 'Adicionar ao plano'}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ),
            )}
            <div ref={endRef} />
          </div>
          {error && <p role="alert">{error}</p>}
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label className="sr-only" htmlFor="chat-input">Mensagem</label>
            <input id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pergunte ou diga o que você quer" maxLength={1000} disabled={busy} />
            <button className="btn-primary" type="submit" disabled={busy || !input.trim()}>
              <Send size={15} aria-hidden="true" /> {busy ? 'Respondendo…' : 'Enviar'}
            </button>
            {turns.length > 0 && (
              <button type="button" className="btn-outline" onClick={() => { setTurns([]); setError(''); }} disabled={busy}>
                Nova conversa
              </button>
            )}
          </form>
        </>
      )}
    </section>
  );
}
