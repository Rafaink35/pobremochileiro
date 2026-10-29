import { useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { parseBRL } from '../api/fx.js';
import { searchGroups, searchUrl } from '../data/searchSites.js';

const LABELS = { origem: 'Saindo de', destino: 'Indo para', data: 'Data (opcional)', lugar: 'Cidade ou país' };

export function MoreSearch({ onUseInPlan }) {
  const [groupId, setGroupId] = useState('bus');
  const [values, setValues] = useState({});
  const [save, setSave] = useState({ site: '', amount: '', url: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const setS = (k) => (e) => setSave((v) => ({ ...v, [k]: e.target.value }));
  const group = searchGroups.find((g) => g.id === groupId);
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }));

  const query = (() => {
    const v = (k) => (values[k] || '').trim();
    if (group.id === 'bus') {
      return ['passagem de ônibus', v('origem') && `de ${v('origem')}`, v('destino') && `para ${v('destino')}`, v('data')]
        .filter(Boolean)
        .join(' ');
    }
    const base = { camping: 'camping', volunteer: 'voluntariado', aupair: 'au pair' }[group.id];
    return [base, v('lugar')].filter(Boolean).join(' ');
  })();

  const CATEGORY = { bus: 'Transporte', camping: 'Hospedagem', volunteer: 'Hospedagem', aupair: 'Hospedagem' };
  const saveExpense = (e) => {
    e.preventDefault();
    const amount = parseBRL(save.amount);
    const url = save.url.trim();
    if (!(amount >= 0)) return setSaveMsg('Digite o valor em reais.');
    if (url && !/^https:\/\//i.test(url)) return setSaveMsg('O link precisa começar com https://');
    const label = [group.label, query.replace(/^(camping|voluntariado|au pair|passagem de ônibus)\s?/, '')]
      .filter(Boolean)
      .join(': ');
    onUseInPlan?.(
      [{ label, amount: amount.toFixed(2).replace('.', ','), url, source: save.site.trim() || 'site' }],
      CATEGORY[group.id],
    );
    setSave({ site: '', amount: '', url: '' });
    setSaveMsg('Adicionado ao plano ✓');
  };

  return (
    <section className="more-search">
      <h3>
        <Search size={18} aria-hidden="true" /> Ônibus, camping, voluntariado e au pair
      </h3>
      <div className="plan-add" role="tablist" aria-label="Categoria">
        {searchGroups.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={g.id === groupId}
            className={g.id === groupId ? 'btn-primary' : 'btn-outline'}
            onClick={() => setGroupId(g.id)}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="flights-form">
        {group.fields.map((f) => (
          <label key={f}>
            {LABELS[f]}
            <input value={values[f] || ''} onChange={set(f)} placeholder={f === 'data' ? '15/12' : ''} />
          </label>
        ))}
      </div>
      <ul className="flex-list">
        {group.sites.map((s) => (
          <li key={s.domain}>
            <span>
              <b>{s.name}</b>
            </span>
            <a href={searchUrl(s.domain, query)} target="_blank" rel="noopener noreferrer">
              Procurar <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
      <form onSubmit={saveExpense} className="flights-form">
        <label>
          Site onde achou
          <input value={save.site} onChange={setS('site')} placeholder="Ex.: Buser" />
        </label>
        <label>
          Valor (R$)
          <input inputMode="decimal" value={save.amount} onChange={setS('amount')} placeholder="120" required />
        </label>
        <label>
          Link da oferta
          <input value={save.url} onChange={setS('url')} placeholder="https://..." />
        </label>
        <button className="btn-outline" type="submit">
          Salvar gasto no plano
        </button>
      </form>
      {saveMsg && <p role="status">{saveMsg}</p>}
      <p className="flights-note">
        {group.note} Esses sites não têm integração com o app: abrimos uma pesquisa para você, e a compra ou a inscrição
        acontece lá.
      </p>
    </section>
  );
}
