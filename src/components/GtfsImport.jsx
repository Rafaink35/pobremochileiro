import { useState } from 'react';
import { gtfsProvider } from '../services/transport/providerRegistry.js';

const EMPTY = { name: '', url: '', license: '', attribution: '', commercialUse: 'unverified' };

// Importação de um GTFS ZIP AUTORIZADO. Fica só na memória deste navegador: recarregar a página apaga.
export function GtfsImport() {
  const [meta, setMeta] = useState(EMPTY);
  const [report, setReport] = useState(null);
  const set = (k) => (e) => setMeta((m) => ({ ...m, [k]: e.target.value }));

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    setReport(gtfsProvider.importZip(bytes, meta));
    e.target.value = '';
  };

  return (
    <details className="gtfs-import">
      <summary>Importar um GTFS (avançado)</summary>
      <p className="flights-note">
        Use apenas conjuntos que você tem autorização para usar. Os dados ficam só na memória deste navegador e não são
        enviados a nenhum servidor. Preencha a licença e a atribuição conforme a fonte original.
      </p>
      <div className="flights-form">
        <label>
          Nome da fonte
          <input value={meta.name} onChange={set('name')} />
        </label>
        <label>
          URL original
          <input value={meta.url} onChange={set('url')} placeholder="https://" />
        </label>
        <label>
          Licença
          <input value={meta.license} onChange={set('license')} placeholder="Ex.: CC BY 4.0" />
        </label>
        <label>
          Atribuição exigida
          <input value={meta.attribution} onChange={set('attribution')} />
        </label>
        <label>
          Uso comercial
          <select value={meta.commercialUse} onChange={set('commercialUse')}>
            <option value="unverified">Ainda não verificado</option>
            <option value="allowed">Permitido</option>
            <option value="prohibited">Proibido</option>
          </select>
        </label>
        <label>
          Arquivo GTFS (.zip)
          <input type="file" accept=".zip,application/zip" onChange={onFile} />
        </label>
      </div>
      {report && (
        <div role="status">
          {report.errors.map((m) => (
            <p key={m} role="alert">
              {m}
            </p>
          ))}
          {report.dataset && (
            <p>
              {report.duplicate ? 'Conjunto já importado.' : 'Importado.'} {report.dataset.counts.stops} paradas,{' '}
              {report.dataset.counts.routes} linhas, {report.dataset.counts.trips} viagens.
              {!report.dataset.hasFares && ' Sem tarifas no conjunto: preços aparecerão como "não informado".'}
            </p>
          )}
          {report.dataset?.meta.issues.map((m) => (
            <p key={m} className="flights-note">
              Revisar: {m}
            </p>
          ))}
          {report.warnings.slice(0, 5).map((m) => (
            <p key={m} className="flights-note">
              {m}
            </p>
          ))}
        </div>
      )}
    </details>
  );
}
