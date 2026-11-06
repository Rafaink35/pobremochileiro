import { PRICE_CLASS_LABEL } from '../services/stays/price.js';
import { describePricing } from '../services/stays/legacy.js';

const SECTIONS = [
  ['ranked', 'Melhores preços verificados', 'Só concorrem locais com preço confirmado ou publicado, dentro do prazo, na mesma moeda e unidade.'],
  ['withPrice', 'Com preço informado', 'Preço verificável que não entrou no ranking (outra unidade ou moeda, ou além das 3 primeiras).'],
  ['stalePrice', 'Preço desatualizado', 'O preço existe, mas passou do prazo (confirmado: 30 dias; publicado: 180 dias). Confirme com o local.'],
  ['noPrice', 'Sem preço informado', 'Estão na pesquisa, mas nenhuma fonte informou preço. Isso não quer dizer que sejam baratos nem caros.'],
];
const BADGE = { confirmed: 'confirmed', published: 'published', stale: 'estimate', unavailable: 'unknown' };
const SOURCE_STATUS = { ok: 'consultada', stale: 'sem resposta agora, usando cópia anterior', failed: 'indisponível agora', skipped: 'não se aplica', not_configured: 'não configurada' };
const dateOf = (iso) => (iso ? String(iso).slice(0, 10) : null);

/** Resultados do Stay Finder: seções separadas (com preço × sem preço), fontes com licença e avisos. Reaproveita as classes atuais. */
export function StayResults({ meta, records, kindName, onOpen, onAdd, inPlan }) {
  const visible = new Set(records.map((r) => r.id));
  return (
    <>
      <p role="status">
        Resultados para <b>{meta.destination.label || meta.destination.name}</b> (raio de {Math.round(meta.destination.radiusM / 1000)} km) · pesquisa em {dateOf(meta.collectedAt)}
        {meta.status === 'partial' && ' · algumas fontes falharam (veja abaixo)'}.
      </p>
      {meta.destinationSource && (
        <p className="flights-note">Destino localizado com <a href={meta.destinationSource.url} target="_blank" rel="noopener noreferrer">{meta.destinationSource.name}</a> · licença {meta.destinationSource.license} · {meta.destinationSource.attribution}</p>
      )}
      {meta.message && <p role="status">{meta.message}</p>}
      {(meta.categoryNotes ?? []).map((n) => <p key={n} className="flights-note">{n}</p>)}
      {SECTIONS.map(([key, title, hint]) => {
        const rows = records.filter((r) => r.section === key);
        if (!rows.length) return null;
        return (
          <section key={key} aria-label={title}>
            <h3>{title} ({rows.length})</h3>
            <p className="flights-note">{hint}{key === 'ranked' && meta.rankNotes?.length ? ` ${meta.rankNotes.join(' ')}` : ''}</p>
            <ul className="flex-list">
              {rows.map((c) => (
                <li key={c.id}>
                  <span>
                    {key === 'ranked' && <b>{c.rank}º · </b>}
                    <b>{c.name ?? 'Local sem nome'}</b> · {kindName[c.kind] ?? 'hospedagem'}{c.stars ? ` · ${c.stars}★` : ''}
                    {[c.city, c.region].filter(Boolean).length ? ` · ${[c.city, c.region].filter(Boolean).join(' / ')}` : ''}
                    {c.distanceM != null ? ` · ${(c.distanceM / 1000).toFixed(1)} km do centro` : ''}
                    {c.registries?.includes('cadastur') ? ' · cadastrado no Cadastur' : ''}
                  </span>
                  <small>
                    <span className={`plan-badge badge-${BADGE[c.pricing.class]}`}>{PRICE_CLASS_LABEL[c.pricing.class]}</span>{' '}
                    {describePricing(c.pricing) ?? (c.priceText ? `A fonte menciona “${c.priceText}”, sem valor e moeda utilizáveis.` : 'Nenhuma fonte informou preço.')}
                  </small>
                  {c.possibleDuplicates?.length > 0 && <small>Possível duplicata de outro resultado (não unificada).</small>}
                  <button className="btn-outline" onClick={() => onOpen(c)}>Ver detalhes</button>
                  <button className="btn-outline" onClick={() => onAdd(c)} disabled={inPlan(c)}>{inPlan(c) ? 'No planejador ✓' : 'Adicionar ao planejador'}</button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {visible.size === 0 && !meta.message && <p>Nenhum local combina com os filtros.</p>}
      <div className="flights-note" role="note">
        <p><b>Fontes desta pesquisa</b> (atribuição e licença de cada uma):</p>
        <ul>
          {meta.sources.map((s) => (
            <li key={s.id}>
              {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name} · {SOURCE_STATUS[s.status] ?? s.status}
              {s.status === 'ok' || s.status === 'stale' ? ` · ${s.count} registro(s)` : ''}
              {s.collectedAt ? ` · dados de ${dateOf(s.collectedAt)}` : ''}
              {s.reason ? ` · ${s.reason}` : ''}{s.error ? ` · ${s.error}` : ''} · licença {s.license} · {s.attribution}
              {s.note ? ` · ${s.note}` : ''}
            </li>
          ))}
        </ul>
        <p>Ausência de resultado ou de preço não prova que o local não existe ou não cobra. Disponibilidade nunca é presumida: confirme com o local antes de ir.</p>
      </div>
    </>
  );
}
