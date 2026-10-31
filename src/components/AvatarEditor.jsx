import { useState } from 'react';
import { AvatarArt } from './AvatarArt.jsx';
import { BACKGROUNDS, DEFAULT_ICON, DEFAULT_PERSON, ICONS, PERSON_FIELDS, normalizeAvatar, randomAvatar } from '../services/avatar/model.js';

const FIELD_LABEL = {
  skin: 'Tom de pele', body: 'Corpo', hair: 'Cabelo', hairColor: 'Cor do cabelo', facial: 'Barba', hat: 'Chapéu ou lenço',
  glasses: 'Óculos', shirt: 'Cor da camiseta', pin: 'Bandeira (opcional)', mood: 'Expressão', bg: 'Cor de fundo',
};

/** Escolha do avatar: personagem montável ou ícone pronto. `value` é a configuração; `onChange` recebe a nova. */
export function AvatarEditor({ value, onChange }) {
  const current = normalizeAvatar(value) ?? { ...DEFAULT_PERSON };
  const [tab, setTab] = useState(current.kind);
  const set = (field) => (e) => onChange({ ...current, [field]: e.target.value });

  const choose = (kind) => {
    setTab(kind);
    onChange(kind === 'person' ? (current.kind === 'person' ? current : { ...DEFAULT_PERSON }) : current.kind === 'icon' ? current : { ...DEFAULT_ICON });
  };

  return (
    <fieldset className="avatar-editor">
      <legend>Seu avatar</legend>
      <div className="avatar-editor-top">
        <AvatarArt config={current} size={104} title="Prévia do seu avatar" />
        <div className="plan-add" role="tablist" aria-label="Tipo de avatar">
          <button type="button" role="tab" aria-selected={tab === 'person'} className={tab === 'person' ? 'btn-primary' : 'btn-outline'} onClick={() => choose('person')}>Personagem</button>
          <button type="button" role="tab" aria-selected={tab === 'icon'} className={tab === 'icon' ? 'btn-primary' : 'btn-outline'} onClick={() => choose('icon')}>Ícone</button>
          {tab === 'person' && <button type="button" className="btn-outline" onClick={() => onChange(randomAvatar())}>Sortear</button>}
        </div>
      </div>
      {tab === 'person' && current.kind === 'person' && (
        <div className="avatar-fields">
          {Object.entries(PERSON_FIELDS).map(([field, list]) => (
            <label key={field}>
              {FIELD_LABEL[field]}
              <select value={current[field]} onChange={set(field)}>
                {list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
      {tab === 'icon' && current.kind === 'icon' && (
        <>
          <div className="icon-grid" role="radiogroup" aria-label="Ícone">
            {ICONS.map((i) => (
              <button key={i.id} type="button" role="radio" aria-checked={current.icon === i.id} aria-label={i.label} className={'icon-choice' + (current.icon === i.id ? ' on' : '')} onClick={() => onChange({ ...current, icon: i.id })}>
                <AvatarArt config={{ kind: 'icon', icon: i.id, bg: current.bg }} size={44} />
              </button>
            ))}
          </div>
          <label>
            Cor de fundo
            <select value={current.bg} onChange={set('bg')}>{BACKGROUNDS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </label>
        </>
      )}
      <p className="data-note">As escolhas são só visuais: o app não guarda identidade de gênero nem orientação. A bandeira é um adereço que você escolhe mostrar ou não.</p>
    </fieldset>
  );
}
