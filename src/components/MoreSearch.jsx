import { useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { searchGroups, searchUrl } from '../data/searchSites.js';

const LABELS = { origem: 'Saindo de', destino: 'Indo para', data: 'Data (opcional)', lugar: 'Cidade ou país' };

export function MoreSearch() {
  const [groupId, setGroupId] = useState('bus');
  const [values, setValues] = useState({});
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
      <p className="flights-note">
        {group.note} Esses sites não têm integração com o app: abrimos uma pesquisa para você, e a compra ou a inscrição
        acontece lá.
      </p>
    </section>
  );
}
