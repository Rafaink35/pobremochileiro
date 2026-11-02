import { useState } from 'react';
import { planSummary } from '../services/planner/stays.js';
import { FxCard } from '../components/FxCard.jsx';
import { FlightsCard } from '../components/FlightsCard.jsx';
import { TripPlan } from '../components/TripPlan.jsx';
import { ChatAgent } from '../components/ChatAgent.jsx';
import { FlexSearch } from '../components/FlexSearch.jsx';
import { MoreSearch } from '../components/MoreSearch.jsx';
import { ComboCompare } from '../components/ComboCompare.jsx';
import { WhiteLabelSearch } from '../components/WhiteLabelSearch.jsx';
import {
  ArrowUpRight,
  Bookmark,
  CircleDollarSign,
  Compass,
  MapPin,
  Map,
  Sparkles,
  TentTree,
  Wallet,
} from 'lucide-react';

const DAY_OPTIONS = ['1', '2', '3', '4', '5', '7', '10', '14'];

const TABS = [
  ['plano', 'Meu plano'],
  ['voos', 'Voos'],
  ['datas', 'Datas flexíveis'],
  ['combos', 'Combos'],
  ['terra', 'Ônibus e mais'],
  ['hospedagem', 'Hospedagem'],
  ['assistente', 'Assistente'],
];

export function Planner({ draft, setDraft, onSaveDraft, onSubmit, onNavigate }) {
  const [tab, setTab] = useState('plano');
  const { tripName, origin, days, budget } = draft;

  const addItems = (rows, category = 'Transporte') =>
    setDraft((old) => ({
      ...old,
      items: [
        ...(old.items || []),
        ...rows.map((r) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          category,
          ...r,
        })),
      ],
    }));

  const summary = planSummary(draft);
  const planCount = (draft.items?.length ?? 0) + (draft.stays?.length ?? 0);
  const money = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const update = (field) => (e) => setDraft((old) => ({ ...old, [field]: e.target.value }));

  return (
    <section className="page-section planner-page">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">PAPEL, CANETA E PÉ NA ESTRADA</p>
          <h1>
            Planeje sem <span>passar aperto.</span>
          </h1>
          <p className="section-subtitle">
            Organize uma estimativa. Os campos começam vazios — nada de preço inventado.
          </p>
        </div>
        <div className="planner-sticker" aria-hidden="true">
          <Wallet size={30} />
          <span>
            CONTA
            <br />
            COMIGO
          </span>
        </div>
      </div>

      <div className="planner-tabs" role="tablist" aria-label="Partes do planejador">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`}
            className={tab === id ? 'btn-primary' : 'btn-outline'} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab !== 'plano' && (
        <p className="plan-bar" role="status">
          <b>Meu plano:</b> {planCount} {planCount === 1 ? 'item' : 'itens'} · total parcial {money(summary.knownTotal)}
          <button type="button" className="back-link" onClick={() => setTab('plano')}>Ver plano →</button>
        </p>
      )}

      {tab === 'plano' && (<div role="tabpanel" id="panel-plano" aria-labelledby="tab-plano">
      <div className="planner-layout">
        <form
          className="planner-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <label>
            Nome da viagem
            <input value={tripName} onChange={update('tripName')} placeholder="Ex.: Feriado na serra" />
          </label>
          <label>
            De onde você sai?
            <input value={origin} onChange={update('origin')} placeholder="Cidade de origem (opcional)" />
          </label>
          <div className="form-two">
            <label>
              Quantos dias?
              <select value={days} onChange={update('days')}>
                {[...new Set([...DAY_OPTIONS, days])].sort((a, b) => a - b).map((n) => (
                  <option key={n} value={n}>
                    {n} {n === '1' ? 'dia' : 'dias'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Orçamento total (R$)
              <input
                inputMode="decimal"
                value={budget}
                onChange={update('budget')}
                placeholder="Digite seu limite"
              />
            </label>
          </div>
          <div className="budget-tip">
            <Sparkles size={18} aria-hidden="true" />
            <p>
              <b>Dica de mochileiro:</b> inclua transporte, hospedagem, comida, passeios e uma reserva
              para imprevistos.
            </p>
          </div>
          <button className="btn-primary submit-plan" type="submit">
            Atualizar meu rascunho <ArrowUpRight size={17} aria-hidden="true" />
          </button>
        </form>

        <aside className="budget-summary">
          <div className="summary-top">
            <span>SEU RASCUNHO</span>
            <span className="summary-icon" aria-hidden="true">
              <Map size={19} />
            </span>
          </div>
          <h2>{tripName || 'Minha próxima aventura'}</h2>
          <p className="summary-origin">
            {origin || 'Origem ainda não definida'} · {days} {days === '1' ? 'dia' : 'dias'}
          </p>
          <div className="summary-divider" />
          <div className="summary-budget">
            <span>Limite informado</span>
            <strong>{budget.trim() ? `R$ ${budget}` : 'A definir'}</strong>
          </div>
          <FxCard budget={budget} />
          <p className="summary-warning">
            O câmbio é só referência. Este rascunho não calcula nem confirma custos de viagem.
          </p>
          <button className="btn-outline full" onClick={onSaveDraft}>
            <Bookmark size={16} aria-hidden="true" /> Guardar rascunho
          </button>
        </aside>
      </div>

      <TripPlan draft={draft} setDraft={setDraft} />

      </div>)}

      {tab === 'voos' && (
        <div role="tabpanel" id="panel-voos" aria-labelledby="tab-voos">
          <WhiteLabelSearch />
          <FlightsCard onUseInPlan={addItems} />
        </div>
      )}
      {tab === 'datas' && <div role="tabpanel" id="panel-datas" aria-labelledby="tab-datas"><FlexSearch onUseInPlan={addItems} /></div>}
      {tab === 'combos' && <div role="tabpanel" id="panel-combos" aria-labelledby="tab-combos"><ComboCompare onUseInPlan={addItems} /></div>}
      {tab === 'terra' && <div role="tabpanel" id="panel-terra" aria-labelledby="tab-terra"><MoreSearch onUseInPlan={addItems} /></div>}
      {tab === 'hospedagem' && (
        <div role="tabpanel" id="panel-hospedagem" aria-labelledby="tab-hospedagem" className="route-card">
          <h2>Hotéis, hostels, campings e trabalho em troca</h2>
          <p>Procure na tela de Hospedagem e use <b>"Adicionar ao planejador"</b> no detalhe de cada local. Eles voltam para o seu plano.</p>
          <button type="button" className="btn-primary" onClick={() => onNavigate?.('Hospedagem')}>Abrir Hospedagem</button>
        </div>
      )}
      {tab === 'assistente' && <div role="tabpanel" id="panel-assistente" aria-labelledby="tab-assistente"><ChatAgent draft={draft} onUseInPlan={addItems} /></div>}

      {tab === 'plano' && (
        <div className="next-steps">
        <h3>O que colocar na conta?</h3>
        <div className="cost-categories">
          <span>
            <TentTree aria-hidden="true" />
            Hospedagem
          </span>
          <span>
            <Compass aria-hidden="true" />
            Passeios
          </span>
          <span>
            <MapPin aria-hidden="true" />
            Transporte
          </span>
          <span>
            <CircleDollarSign aria-hidden="true" />
            Alimentação
          </span>
        </div>
      </div>
      )}
    </section>
  );
}
