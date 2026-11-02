import { comparePlans, CATEGORIES } from '../services/planner/plans.js';

const brl = (n) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Tabela lado a lado. Só afirma "mais barato" quando dá para ter certeza (ver comparePlans). */
export function ComparePlans({ draft, onPick }) {
  const c = comparePlans(draft);
  const filled = c.rows.filter((r) => !r.empty);
  if (c.rows.length < 2) return <p className="flights-note">Crie um segundo plano (botão "Novo plano" ou "Duplicar") para comparar qual sai mais barato.</p>;
  if (filled.length < 2) return <p className="flights-note">Coloque itens em pelo menos dois planos para comparar.</p>;
  return (
    <section className="compare-plans">
      <h3>Qual plano sai mais barato?</h3>
      {c.cheapestId ? (
        <p role="status" className="compare-verdict ok">
          <b>{c.rows.find((r) => r.id === c.cheapestId).name}</b> é o mais barato: tem todos os valores e nenhum outro plano pode custar menos.
        </p>
      ) : (
        <p role="status" className="compare-verdict">
          Ainda não dá para declarar o mais barato: há plano com valor faltando, e o custo real dele é maior ou igual ao total parcial.
          {c.lowestPartialId && <> O menor total parcial é o de <b>{c.rows.find((r) => r.id === c.lowestPartialId).name}</b>.</>}
        </p>
      )}
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">&nbsp;</th>
              {c.rows.map((r) => (
                <th key={r.id} scope="col" className={r.id === c.cheapestId ? 'best' : ''}>
                  {r.name}{r.active ? ' (ativo)' : ''}{r.id === c.cheapestId ? ' ★' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr><th scope="row">{c.rows.every((r) => r.complete || r.empty) ? 'Total' : 'Total (parcial se houver faltas)'}</th>{c.rows.map((r) => <td key={r.id}><b>{r.empty ? '—' : brl(r.total)}</b></td>)}</tr>
            <tr><th scope="row">Situação</th>{c.rows.map((r) => <td key={r.id}>{r.empty ? 'vazio' : r.complete ? 'completo' : `faltam ${r.unknown.length} valor(es)`}</td>)}</tr>
            {CATEGORIES.map((cat) => (
              <tr key={cat}><th scope="row">{cat}</th>{c.rows.map((r) => <td key={r.id}>{r.byCategory[cat] > 0 ? brl(r.byCategory[cat]) : '—'}</td>)}</tr>
            ))}
            <tr><th scope="row">Por dia</th>{c.rows.map((r) => <td key={r.id}>{r.perDay ? brl(r.perDay) : '—'}</td>)}</tr>
            <tr>
              <th scope="row">Contra o orçamento</th>
              {c.rows.map((r) => (
                <td key={r.id}>
                  {r.empty || r.limit === null ? '—' : r.overLimit ? `passa em ${brl(-r.leftover)}` : r.complete ? `sobram ${brl(r.leftover)}` : `até agora sobram ${brl(r.leftover)}`}
                </td>
              ))}
            </tr>
            <tr><th scope="row">Itens / hospedagens</th>{c.rows.map((r) => <td key={r.id}>{r.itemCount} / {r.stayCount}</td>)}</tr>
            <tr><th scope="row">&nbsp;</th>{c.rows.map((r) => <td key={r.id}>{!r.active && <button type="button" className="btn-outline" onClick={() => onPick(r.id)}>Abrir este plano</button>}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <p className="flights-note">Só entram valores que você informou ou adicionou de uma fonte. Hospedagem paga sem noites definidas fica de fora do total e aparece como valor faltando.</p>
    </section>
  );
}
