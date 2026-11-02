import { useState } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { activePlanId, createPlan, deletePlan, listPlans, renamePlan, switchPlan } from '../services/planner/plans.js';

/** Escolhe o plano ativo (tudo o que for adicionado no app vai para ele) e cria, duplica, renomeia ou apaga planos. */
export function PlanSwitcher({ draft, setDraft, notify }) {
  const plans = listPlans(draft);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const active = plans.find((p) => p.active);

  const add = (copy) => {
    const { draft: next, created } = createPlan(draft, { copy });
    if (!created) return notify?.('Limite de 6 planos. Apague um para criar outro.');
    setDraft(() => next);
    notify?.(copy ? 'Plano duplicado. Mude o que quiser e compare.' : 'Plano novo criado, vazio.');
  };
  const save = (e) => {
    e.preventDefault();
    setDraft((d) => renamePlan(d, name));
    setRenaming(false);
  };
  const remove = () => {
    if (plans.length <= 1) return notify?.('Você precisa ter pelo menos um plano.');
    if (!window.confirm(`Apagar "${active.name}"? Isso não pode ser desfeito.`)) return;
    setDraft((d) => deletePlan(d));
  };

  return (
    <div className="plan-switcher" role="group" aria-label="Planos da viagem">
      <label>
        Plano ativo
        <select value={activePlanId(draft)} onChange={(e) => setDraft((d) => switchPlan(d, e.target.value))}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {renaming ? (
        <form onSubmit={save} className="plan-rename">
          <label className="sr-only" htmlFor="plan-name">Nome do plano</label>
          <input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
          <button className="btn-primary" type="submit">Salvar</button>
          <button className="btn-outline" type="button" onClick={() => setRenaming(false)}>Cancelar</button>
        </form>
      ) : (
        <div className="plan-switcher-actions">
          <button type="button" className="btn-outline" onClick={() => add(false)}><Plus size={14} aria-hidden="true" /> Novo plano</button>
          <button type="button" className="btn-outline" onClick={() => add(true)}><Copy size={14} aria-hidden="true" /> Duplicar</button>
          <button type="button" className="btn-outline" onClick={() => { setName(active.name); setRenaming(true); }}><Pencil size={14} aria-hidden="true" /> Renomear</button>
          <button type="button" className="btn-outline" onClick={remove} disabled={plans.length <= 1}><Trash2 size={14} aria-hidden="true" /> Apagar</button>
        </div>
      )}
      <small>Tudo o que você adicionar vai para o plano ativo. Crie outro plano para comparar caminhos diferentes.</small>
    </div>
  );
}
