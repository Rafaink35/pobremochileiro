import { ArrowUpRight } from 'lucide-react';
import { CATEGORY_LABEL } from '../services/trip/budget.js';
import { unitLabel } from '../services/trip/price.js';
import { sourceOf } from '../services/trip/knowledge.js';

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const STATUS_LABEL = { confirmed: 'confirmado', published: 'publicado, não reconfirmado', estimate: 'estimativa', stale: 'desatualizado (conta como estimativa)', unknown: 'não informado' };
const FIT_LABEL = {
  within: 'Cabe no orçamento',
  within_partial: 'Cabe até aqui, mas faltam custos',
  over: 'Passa do orçamento',
  unknown: 'Sem dados para comparar',
  no_budget: 'Sem orçamento informado',
};
const CLAIM_LABEL = {
  confirmed: 'Total com todos os valores confirmados ou publicados',
  estimated: 'Total estimado: há estimativas ou preços desatualizados',
  incomplete: 'Total incompleto: há custos pendentes, o gasto real pode ser maior',
};
const BALANCE_LABEL = { exact: 'Saldo', estimated: 'Saldo estimado', upper_bound: 'Saldo máximo (pode ser menor)' };

export function TripResultCard({ result, kb, onSend }) {
  const b = result.budget;
  const used = b.lines.filter((l) => l.total.amount !== null);
  return (
    <article className="trip-card paper-card">
      <header>
        <h3>{result.destination.name}</h3>
        <span className={`trip-fit fit-${b.fit}`}>{FIT_LABEL[b.fit]}</span>
      </header>
      {result.destination.description && <p>{result.destination.description}</p>}

      <table className="trip-lines">
        <caption className="sr-only">Custos discriminados</caption>
        <thead>
          <tr><th>Item</th><th>Valor</th><th>Situação</th><th>Fonte</th></tr>
        </thead>
        <tbody>
          {b.lines.map((l) => {
            const src = sourceOf(kb, l.price);
            return (
              <tr key={l.key}>
                <td>{CATEGORY_LABEL[l.category]}: {l.label}</td>
                <td>
                  {l.total.amount !== null ? (
                    <>
                      <b>{brl(l.total.amount)}</b>
                      <small> ({brl(l.price.amount)} {unitLabel(l.price.unit)} × {l.total.multiplier})</small>
                    </>
                  ) : (
                    'valor não informado'
                  )}
                </td>
                <td>{STATUS_LABEL[l.total.status]}{l.total.status === 'unknown' && l.total.reason ? `: ${l.total.reason}` : ''}</td>
                <td>
                  {l.price.origin ? (
                    <>
                      {l.price.referenceUrl ? <a href={l.price.referenceUrl} target="_blank" rel="noopener noreferrer">{l.price.origin.name}</a> : l.price.origin.name}
                      {src?.license ? ` · ${src.license}` : ''}
                      {l.price.collectedAt ? ` · coletado em ${l.price.collectedAt.slice(0, 10)}` : ''}
                    </>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <dl className="trip-totals">
        <div><dt>Conhecido (confirmado ou publicado)</dt><dd>{brl(b.knownTotal)}</dd></div>
        <div><dt>Estimado ou desatualizado</dt><dd>{brl(b.estimatedTotal)}</dd></div>
        <div><dt>Reserva para imprevistos ({b.contingency.pct}%)</dt><dd>{b.contingency.amount !== null ? brl(b.contingency.amount) : 'não calculada'}</dd></div>
        <div><dt>Custo mínimo</dt><dd><b>{brl(b.minimumTotal)}</b></dd></div>
        {b.balance && <div><dt>{BALANCE_LABEL[b.balance.kind]}</dt><dd>{brl(b.balance.amount)}</dd></div>}
      </dl>
      <p className={`trip-claim claim-${b.finalCostClaim}`} role="status">{CLAIM_LABEL[b.finalCostClaim]}.</p>

      {b.pending.length > 0 && (
        <div>
          <b>Informações pendentes</b>
          <ul>{b.pending.map((p) => <li key={p.key}>{p.label}: {p.reason}{p.essential ? ' (essencial)' : ''}</li>)}</ul>
        </div>
      )}

      <div>
        <b>Por que aparece aqui</b>
        <ul>
          {result.reasons.filter((r) => r.code !== 'pending').map((r, i) => <li key={`${r.code}-${i}`}>{r.text}</li>)}
        </ul>
      </div>

      <div className="plan-add">
        <button className="btn-primary" onClick={() => onSend(result)}>
          Enviar ao planejador <ArrowUpRight size={15} aria-hidden="true" />
        </button>
        {used.length === 0 && <small>Ainda sem valores conhecidos: o planejador receberá só o destino.</small>}
      </div>
    </article>
  );
}
