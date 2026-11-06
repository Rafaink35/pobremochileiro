import { useState } from 'react';
import { Compass } from 'lucide-react';
import { knowledgeBase, knowledgeErrors } from '../data/knowledge/index.js';
import { hasFixtureSources, isEmptyKnowledgeBase, knownOrigins } from '../services/trip/knowledge.js';
import { recommend, RECOMMEND_STATUS } from '../services/trip/recommender.js';
import { parseTripRequest, PREFERENCE_PATTERNS } from '../services/trip/requestParser.js';
import { planFromResult } from '../services/trip/plan.js';
import { TripResultCard } from '../components/TripResultCard.jsx';

const PREFERENCES = PREFERENCE_PATTERNS.map(([name]) => name);
const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MODE_CHOICES = [['bus', 'Ônibus'], ['flight', 'Voo'], ['train', 'Trem'], ['ferry', 'Balsa']];
const LODGING_CHOICES = [['hostel', 'Hostel'], ['guesthouse', 'Pousada'], ['hotel', 'Hotel'], ['camping', 'Camping']];
const EMPTY_FORM = {
  budget: '', budgetScope: 'total', origin: '', days: '', people: '1', startDate: '', preferences: [], hasCar: 'unknown',
  modes: MODE_CHOICES.map(([m]) => m), lodgingKinds: [],
};
const today = () => new Date().toISOString().slice(0, 10);

export function Discover({ setDraft, onNavigate }) {
  const [text, setText] = useState('');
  const [understood, setUnderstood] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [outcome, setOutcome] = useState(null);
  const empty = isEmptyKnowledgeBase(knowledgeBase);
  const fixtureMode = hasFixtureSources(knowledgeBase); // só em desenvolvimento (VITE_USE_FIXTURES=1)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggleIn = (key) => (value) => setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));
  const togglePref = toggleIn('preferences');

  const interpret = () => {
    const r = parseTripRequest(text, { knownPlaces: knownOrigins(knowledgeBase) });
    setUnderstood(r);
    setForm((f) => ({
      ...f,
      budget: r.params.budget !== null ? String(r.params.budget) : f.budget,
      origin: r.params.origin ?? f.origin,
      days: r.params.days !== null ? String(r.params.days) : f.days,
      people: String(r.params.people ?? f.people),
      preferences: r.params.preferences.length ? r.params.preferences : f.preferences,
      hasCar: r.params.hasCar === null ? f.hasCar : r.params.hasCar ? 'yes' : 'no',
    }));
  };

  const submit = (e) => {
    e.preventDefault();
    setOutcome(
      recommend({
        budget: Number(String(form.budget).replace(/\./g, '').replace(',', '.')),
        budgetScope: form.budgetScope, startDate: form.startDate || null, modes: form.modes, lodgingKinds: form.lodgingKinds,
        origin: form.origin, days: Number(form.days), people: Number(form.people) || 1, preferences: form.preferences,
        hasCar: form.hasCar === 'yes' ? true : form.hasCar === 'no' ? false : null,
      }, knowledgeBase),
    );
  };

  const send = (result) => {
    const plan = planFromResult(result, outcome.request);
    setDraft((old) => ({ ...old, tripName: plan.tripName, origin: plan.origin, days: plan.days, budget: plan.budget, startDate: plan.startDate || old.startDate || '', items: [...(old.items ?? []), ...plan.items] }));
    onNavigate('Planejador');
  };

  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">DINHEIRO CONTADO, SEM CHUTE</p>
          <h1>Descubra até onde seu <span>dinheiro leva você.</span></h1>
          <p className="section-subtitle">
            Diga quanto tem, de onde sai e quantos dias. Cada valor mostra a fonte, a data e se é confirmado ou estimativa.
          </p>
        </div>
        <div className="page-doodle" aria-hidden="true"><Compass size={32} /></div>
      </div>

      {fixtureMode && (
        <p className="warn-banner" role="alert">
          MODO DESENVOLVIMENTO: os destinos e valores desta tela são fictícios (fixtures de teste) e não são oportunidades reais.
        </p>
      )}
      {empty && (
        <div className="empty-state" role="status">
          <h3>Ainda não há preços verificados</h3>
          <p>
            Não há destinos, preços e fontes cadastrados, então os custos aparecem como “Preço indisponível”. Para não mostrar oferta inventada,
            esta tela não exibe resultados sem dados reais (com fonte, licença e data). Enquanto isso, você pode montar o plano manualmente.
          </p>
          <button className="btn-primary" onClick={() => onNavigate('Planejador')}>Ir para o planejador</button>
        </div>
      )}
      {knowledgeErrors.length > 0 && <p className="data-note" role="alert">{knowledgeErrors.length} registro(s) da base foram descartados por erro de validação.</p>}

      <div className="trip-interpret paper-card">
        <label htmlFor="trip-text">
          Escreva o que você procura (opcional)
          <textarea id="trip-text" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: Tenho R$ 600, saio do Rio, quero quatro dias de natureza e não tenho carro." />
        </label>
        <button type="button" className="btn-outline" onClick={interpret} disabled={!text.trim()}>Entender e preencher</button>
        <p className="data-note">Entendo só pedidos simples (valor, cidade de saída, dias, preferências, carro). Se faltar algo, eu pergunto.</p>
        {understood && (
          <div role="status">
            {Object.entries(understood.evidence).map(([k, v]) => <p key={k} className="data-note">Entendi “{v}” como {k}.</p>)}
            {understood.assumptions.map((a) => <p key={a} className="data-note">{a}</p>)}
            {understood.clarifications.map((c) => <p key={c.field} role="alert" className="form-error">{c.question}</p>)}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flights-form trip-form">
        <label>Orçamento (R$)<input inputMode="decimal" required value={form.budget} onChange={set('budget')} placeholder="Ex.: 600" /></label>
        <label>O orçamento é
          <select value={form.budgetScope} onChange={set('budgetScope')}>
            <option value="total">Total do grupo</option>
            <option value="person">Por pessoa</option>
          </select>
        </label>
        <label>Origem<input required value={form.origin} onChange={set('origin')} placeholder="Ex.: Rio de Janeiro" /></label>
        <label>Dias<input inputMode="numeric" required value={form.days} onChange={set('days')} placeholder="Ex.: 4" /></label>
        <label>Pessoas<input inputMode="numeric" value={form.people} onChange={set('people')} /></label>
        <label>Data de saída (opcional)<input type="date" min={today()} value={form.startDate} onChange={set('startDate')} /></label>
        <label>Tem carro?
          <select value={form.hasCar} onChange={set('hasCar')}>
            <option value="unknown">Não informar (carro não será considerado)</option>
            <option value="yes">Sim</option>
            <option value="no">Não</option>
          </select>
        </label>
        <fieldset className="trip-prefs">
          <legend>Como prefere chegar</legend>
          {MODE_CHOICES.map(([m, label]) => (
            <label key={m} className="check"><input type="checkbox" checked={form.modes.includes(m)} onChange={() => toggleIn('modes')(m)} /> {label}</label>
          ))}
        </fieldset>
        <fieldset className="trip-prefs">
          <legend>Tipo de hospedagem (sem marcar = a mais barata)</legend>
          {LODGING_CHOICES.map(([k, label]) => (
            <label key={k} className="check"><input type="checkbox" checked={form.lodgingKinds.includes(k)} onChange={() => toggleIn('lodgingKinds')(k)} /> {label}</label>
          ))}
        </fieldset>
        <fieldset className="trip-prefs">
          <legend>Preferências</legend>
          {PREFERENCES.map((p) => (
            <label key={p} className="check"><input type="checkbox" checked={form.preferences.includes(p)} onChange={() => togglePref(p)} /> {p}</label>
          ))}
        </fieldset>
        <button className="btn-primary" type="submit">Descobrir</button>
      </form>

      {outcome && outcome.status !== RECOMMEND_STATUS.OK && (
        <p className="empty-state" role="status">{outcome.message}</p>
      )}
      {outcome?.status === RECOMMEND_STATUS.OK && (
        <>
          <p role="status">
            {outcome.results.length} destino(s) para {brl(outcome.request.budget)} saindo de {outcome.origin}
            {outcome.request.startDate ? ` em ${outcome.request.startDate.split('-').reverse().join('/')}` : ''}.
            {outcome.hidden.over > 0 && ` ${outcome.hidden.over} destino(s) acima do orçamento foram ocultados.`}
          </p>
          <p className="data-note">Premissas: {outcome.assumptions.join('; ')}.</p>
          <div className="trip-results">
            {outcome.results.map((r) => <TripResultCard key={r.destination.id} result={r} kb={knowledgeBase} onSend={send} />)}
          </div>
        </>
      )}
    </section>
  );
}
