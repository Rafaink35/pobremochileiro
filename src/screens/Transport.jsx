import { RouteExplorer } from '../components/RouteExplorer.jsx';
import { TransportSearch } from '../components/TransportSearch.jsx';

export function Transport({ onNavigate, draft, setDraft, notify }) {
  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">DE A PARA B</p>
          <h1>
            Como chegar <span>sem gastar demais.</span>
          </h1>
          <p className="section-subtitle">
            Rotas, horários e tarifas só aparecem quando existe uma fonte de dados real. Cada resultado mostra de onde
            veio.
          </p>
        </div>
      </div>
      <RouteExplorer onNavigate={onNavigate} draft={draft} setDraft={setDraft} notify={notify} />
      <h2 className="route-subhead">Trechos de ônibus e trem por arquivo GTFS</h2>
      <TransportSearch />
      <p className="flights-note">
        <button className="back-link" onClick={() => onNavigate('Fontes')}>
          Ver fontes de dados e licenças →
        </button>
      </p>
    </section>
  );
}
