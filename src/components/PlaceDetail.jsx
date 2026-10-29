import { useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { TransportSearch } from './TransportSearch.jsx';
import { externalMapLinks } from '../services/geo.js';

const yesNo = (v) => (v === true ? 'sim' : v === false ? 'não' : 'não informado');
const AMENITY_LABEL = {
  toilets: 'Banheiro',
  shower: 'Chuveiro',
  kitchen: 'Cozinha',
  drinkingWater: 'Água potável',
  power: 'Energia',
  wifi: 'Wi-Fi',
  dumpStation: 'Descarte de esgoto (motorhome)',
};
const dateOf = (iso) => (iso ? String(iso).slice(0, 10) : null);

function Row({ label, children }) {
  return (
    <p className="place-row">
      <b>{label}:</b> {children ?? 'não informado'}
    </p>
  );
}

function CampingInfo({ c }) {
  const feeText =
    c.fee === 'free'
      ? 'gratuito, segundo a fonte'
      : c.fee === 'paid'
        ? c.chargeText
          ? `pago · ${c.chargeText} (unidade não informada)`
          : 'pago · valor não informado'
        : 'não informado';
  return (
    <>
      <Row label="Tipo">{c.kind === 'caravan_site' ? 'Área de motorhome/caravana' : 'Camping'}</Row>
      <Row label="Cidade / estado">{[c.city, c.state].filter(Boolean).join(' / ') || null}</Row>
      <Row label="Aceita barracas">{yesNo(c.tents)}</Row>
      <Row label="Aceita caravanas">{yesNo(c.caravans)}</Row>
      <Row label="Preço">{feeText}</Row>
      <ul className="amenity-list">
        {Object.entries(AMENITY_LABEL).map(([k, label]) => (
          <li key={k}>
            {label}: {yesNo(c.amenities[k])}
          </li>
        ))}
      </ul>
      <Row label="Horário (texto da fonte)">{c.openingHours}</Row>
      <Row label="Acesso">{c.access}</Row>
      <Row label="Site">
        {c.website && (
          <a href={c.website} target="_blank" rel="noopener noreferrer">
            {c.website}
          </a>
        )}
      </Row>
      <Row label="Telefone">{c.phone}</Row>
      <Row label="E-mail">{c.email}</Row>
      <p className="flights-note">
        O OpenStreetMap não garante que este local está aberto, aceita hóspedes ou permite acampar hoje. Confirme com o
        local antes de ir.
      </p>
      {c.conflicts?.length > 0 && <p className="flights-note">Fontes divergem em: {c.conflicts.join(', ')}.</p>}
      {c.sources.map((s) => (
        <p key={s.originalId} className="flights-note">
          Fonte: {s.attribution} · Licença: <a href={s.licenseUrl} target="_blank" rel="noopener noreferrer">{s.license}</a> ·{' '}
          <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">{s.originalId}</a> · coletado em {dateOf(s.collectedAt)}
          {s.lastEditedAt ? ` · última edição no OSM: ${dateOf(s.lastEditedAt)}` : ''}
        </p>
      ))}
    </>
  );
}

function WorkInfo({ o }) {
  return (
    <>
      <Row label="Anfitrião">{o.hostName}</Row>
      <Row label="Tipo de estabelecimento">{o.hostType}</Row>
      <Row label="Local">{[o.placeName, o.city, o.state].filter(Boolean).join(' · ') || null}</Row>
      <Row label="Atividades">{o.tasks.join(', ') || null}</Row>
      <Row label="Habilidades pedidas">{o.skills.join(', ') || null}</Row>
      <Row label="Horas de trabalho por semana">{o.hoursPerWeek}</Row>
      <Row label="Folgas por semana">{o.daysOffPerWeek}</Row>
      <Row label="Acomodação">{o.accommodation}</Row>
      <Row label="Refeições">{o.meals}</Row>
      <Row label="Período">{o.startDate || o.endDate ? `${o.startDate ?? '?'} a ${o.endDate ?? '?'}` : null}</Row>
      <Row label="Vagas">{o.spots}</Row>
      <Row label="Requisitos">{o.requirements}</Row>
      <Row label="Despesas do voluntário">{o.expenses}</Row>
      <Row label="Condições">{o.conditions}</Row>
      <Row label="Link do anfitrião">
        {o.externalUrl && (
          <a href={o.externalUrl} target="_blank" rel="noopener noreferrer">
            {o.externalUrl}
          </a>
        )}
      </Row>
      <p className="flights-note">
        Oportunidade aprovada em {dateOf(o.approvedAt) ?? 'data não informada'} · última atualização{' '}
        {dateOf(o.updatedAt) ?? 'não informada'}. Combine horas, comida e hospedagem por escrito antes de ir.
      </p>
    </>
  );
}

export function PlaceDetail({ kind, place, onBack, onAddToPlan, added }) {
  const [showRoute, setShowRoute] = useState(false);
  const name = (kind === 'work_exchange' ? place.hostName : place.name) ?? 'Local sem nome';
  const links = externalMapLinks(place.lat, place.lon);
  const destination = { name, lat: place.lat, lon: place.lon };
  return (
    <article className="place-detail paper-card">
      <button className="back-link" onClick={onBack}>
        ← Voltar para a lista
      </button>
      <h2>{name}</h2>
      <p>
        <MapPin size={15} aria-hidden="true" />{' '}
        {place.lat !== null ? `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}` : 'Coordenadas não disponíveis'}
        {links && (
          <>
            {' · '}
            <a href={links.openStreetMap} target="_blank" rel="noopener noreferrer">Ver no mapa</a>
          </>
        )}
      </p>
      {kind === 'work_exchange' ? <WorkInfo o={place} /> : <CampingInfo c={place} />}
      <div className="plan-add">
        <button className="btn-primary" onClick={() => setShowRoute((v) => !v)} aria-expanded={showRoute}>
          Como chegar
        </button>
        <button className="btn-outline" onClick={onAddToPlan} disabled={added}>
          <Plus size={14} aria-hidden="true" /> {added ? 'Já está no planejador ✓' : 'Adicionar ao planejador'}
        </button>
      </div>
      {showRoute && <TransportSearch destination={destination} />}
    </article>
  );
}
