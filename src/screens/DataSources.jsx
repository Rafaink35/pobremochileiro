import { gtfsProvider } from '../services/transport/providerRegistry.js';
import { attributionText, INTEGRATION_STATUS, INVESTIGATED_SOURCES } from '../services/transport/sourceMetadata.js';

const STATUS_LABEL = {
  [INTEGRATION_STATUS.WORKING]: 'Integração funcionando',
  [INTEGRATION_STATUS.PREPARED]: 'Interface preparada (sem fonte validada)',
  [INTEGRATION_STATUS.INVESTIGATED]: 'Investigada, sem integração',
  [INTEGRATION_STATUS.NOT_AVAILABLE]: 'Sem fonte atual confirmada',
};
const COMMERCIAL_LABEL = { allowed: 'permitido', prohibited: 'proibido', unverified: 'ainda não verificado' };

export function DataSources() {
  const imported = [...gtfsProvider.registry.values()];
  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">DE ONDE VÊM OS DADOS</p>
          <h1>
            Fontes de <span>dados.</span>
          </h1>
          <p className="section-subtitle">
            Atribuições e licenças das fontes usadas. As fontes abaixo foram pesquisadas, mas nenhuma está integrada ao
            app ainda.
          </p>
        </div>
      </div>

      <h3>Conjuntos importados nesta sessão</h3>
      {imported.length === 0 ? (
        <p className="flights-note">Nenhum conjunto importado. Nenhuma atribuição é necessária no momento.</p>
      ) : (
        <ul className="flex-list">
          {imported.map((d) => (
            <li key={d.hash}>
              <span>{attributionText(d.meta)}</span>
              <small>Uso comercial: {COMMERCIAL_LABEL[d.meta.commercialUse]}</small>
              {d.meta.issues.length > 0 && <small>Pendências: {d.meta.issues.join(' ')}</small>}
            </li>
          ))}
        </ul>
      )}

      <h3>Fontes investigadas</h3>
      <ul className="flex-list">
        {INVESTIGATED_SOURCES.map((s) => (
          <li key={s.id}>
            <span>
              <b>{s.name}</b> · {STATUS_LABEL[s.status]}
            </span>
            <small>
              Formatos: {s.formats.join(', ')} · Licença: {s.license} · Cobertura: {s.coverage}
            </small>
            <small>
              Uso comercial: {COMMERCIAL_LABEL[s.commercialUse]} · {s.notes}
            </small>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              Página oficial
            </a>
          </li>
        ))}
      </ul>

      <p className="flights-note">
        O Pobre Mochileiro não tem parceria com os operadores citados nessas fontes, e nenhum deles endossa o app.
        Licenças como a ODbL podem exigir atribuição e o compartilhamento de bases derivadas: cada fonte precisa de
        revisão antes de ser publicada.
      </p>
    </section>
  );
}
