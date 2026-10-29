// Metadados de fontes de dados de transporte: licença, atribuição e uso comercial.
// Nada aqui presume que uma fonte pode ser usada comercialmente: o padrão é "unverified".

export const COMMERCIAL_USE = Object.freeze({
  ALLOWED: 'allowed',
  PROHIBITED: 'prohibited',
  UNVERIFIED: 'unverified',
});

export const INTEGRATION_STATUS = Object.freeze({
  WORKING: 'working', // conexão ou conjunto de dados real validado
  PREPARED: 'prepared', // interface pronta, sem fonte validada
  INVESTIGATED: 'investigated', // pesquisada, ainda sem integração
  NOT_AVAILABLE: 'not_available', // sem fonte oficial acessível encontrada
});

// Licenças comuns, apenas para rotular. Quais obrigações se aplicam a cada uso precisa de revisão.
const SHARE_ALIKE_LICENSES = ['odbl', 'odc-odbl', 'cc by-sa', 'cc-by-sa'];

/**
 * Cria e valida os metadados de um conjunto de dados.
 * Campos desconhecidos ficam `null` (nunca string vazia inventada).
 */
export function createSourceMetadata(input = {}) {
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const license = text(input.license);
  const commercialUse = Object.values(COMMERCIAL_USE).includes(input.commercialUse)
    ? input.commercialUse
    : COMMERCIAL_USE.UNVERIFIED;

  const meta = {
    id: text(input.id),
    name: text(input.name),
    url: text(input.url),
    license,
    attribution: text(input.attribution),
    obtainedAt: text(input.obtainedAt), // data em que baixamos/obtivemos (ISO)
    updatedAt: text(input.updatedAt), // atualização conhecida da fonte (ISO)
    commercialUse,
    shareAlikeReview: Boolean(license) && SHARE_ALIKE_LICENSES.some((l) => license.toLowerCase().includes(l)),
    coverage: text(input.coverage),
    notes: text(input.notes),
  };
  return { ...meta, issues: validateSourceMetadata(meta) };
}

/** Lista o que falta ou exige revisão antes de publicar dados dessa fonte. */
export function validateSourceMetadata(meta) {
  const issues = [];
  if (!meta.name) issues.push('Fonte sem nome.');
  if (!meta.url) issues.push('Fonte sem URL original.');
  if (!meta.license) issues.push('Licença não informada: revisar antes de publicar.');
  if (!meta.attribution) issues.push('Atribuição exigida não informada.');
  if (!meta.obtainedAt) issues.push('Data de obtenção não informada.');
  if (meta.commercialUse === COMMERCIAL_USE.PROHIBITED) issues.push('Uso comercial proibido por essa fonte.');
  if (meta.commercialUse === COMMERCIAL_USE.UNVERIFIED) issues.push('Uso comercial ainda não verificado.');
  if (meta.shareAlikeReview) {
    issues.push('Licença com possível obrigação de compartilhamento de bases derivadas: revisar antes de publicar.');
  }
  return issues;
}

/** True quando a fonte pode ser exibida/usada em produção sem revisão pendente. */
export function isPublishable(meta) {
  return (
    meta.commercialUse === COMMERCIAL_USE.ALLOWED &&
    Boolean(meta.license) &&
    Boolean(meta.attribution) &&
    !meta.shareAlikeReview
  );
}

/** Texto de atribuição para a tela "Fontes de dados". */
export function attributionText(meta) {
  const parts = [meta.attribution || meta.name || 'Fonte sem nome'];
  if (meta.license) parts.push(`Licença: ${meta.license}`);
  if (meta.updatedAt) parts.push(`Atualizado em ${meta.updatedAt.slice(0, 10)}`);
  else if (meta.obtainedAt) parts.push(`Obtido em ${meta.obtainedAt.slice(0, 10)}`);
  return parts.join(' · ');
}

/**
 * Fontes investigadas por pesquisa na web. Nenhuma está com integração validada neste repositório:
 * não foi possível conectar às URLs durante o desenvolvimento. Ver docs/data-sources.md.
 */
export const INVESTIGATED_SOURCES = [
  {
    id: 'transport-data-gouv-fr',
    name: 'transport.data.gouv.fr (França)',
    url: 'https://transport.data.gouv.fr/',
    formats: ['GTFS', 'GTFS-RT', 'NeTEx'],
    license: 'Varia por conjunto (Licence Ouverte e ODbL aparecem nas fichas)',
    coverage: 'França (redes urbanas, interurbanas e agregados regionais)',
    access: 'Download por conjunto; API de listagem anunciada, sem endpoint confirmado',
    commercialUse: COMMERCIAL_USE.UNVERIFIED,
    status: INTEGRATION_STATUS.INVESTIGATED,
    notes: 'Verificar licença de cada conjunto. Não cobre o Brasil.',
  },
  {
    id: 'transport-canberra',
    name: 'Transport Canberra (Austrália)',
    url: 'https://www.transport.act.gov.au/contact-us/information-for-developers',
    formats: ['GTFS', 'GTFS-RT'],
    license: 'Creative Commons BY segundo a página de desenvolvedores; portais de dados abertos listam "não especificada" em registros antigos',
    coverage: 'Canberra (ônibus e metrô leve)',
    access: 'Página de desenvolvedores; feeds antigos descontinuados, URL atual a confirmar',
    commercialUse: COMMERCIAL_USE.UNVERIFIED,
    status: INTEGRATION_STATUS.INVESTIGATED,
    notes: 'Conflito entre licenças informadas: confirmar na página oficial antes de usar.',
  },
  {
    id: 'odpt-tokyo',
    name: 'ODPT, Public Transportation Open Data Center (Japão)',
    url: 'https://tokyochallenge.odpt.org/',
    formats: ['API ODPT (JSON-LD)'],
    license: 'Termos próprios não confirmados',
    coverage: 'Região de Tóquio',
    access: 'Chave de API por cadastro. O desafio de 2019-2020 foi encerrado; confirmar o centro de dados atual',
    commercialUse: COMMERCIAL_USE.UNVERIFIED,
    status: INTEGRATION_STATUS.INVESTIGATED,
    notes: 'Condições de uso comercial não confirmadas.',
  },
  {
    id: 'eurolines-isilines',
    name: 'Eurolines / Isilines (data.gouv.fr)',
    url: 'https://data.gouv.fr/en/datasets/horaires-theoriques-du-reseau-europeen-eurolines-isilines-gtfs',
    formats: ['GTFS'],
    license: 'ODbL (segundo a ficha do conjunto)',
    coverage: 'Rede europeia de ônibus',
    access: 'Download na ficha do data.gouv.fr',
    commercialUse: COMMERCIAL_USE.UNVERIFIED,
    status: INTEGRATION_STATUS.NOT_AVAILABLE,
    notes: 'Última atualização conhecida: maio de 2019. Provavelmente desatualizado; não há feed oficial atual confirmado.',
  },
  {
    id: 'rio-gtfs',
    name: 'GTFS dos ônibus do Rio de Janeiro (data.rio / SMTR)',
    url: 'https://community.openstreetmap.org/t/gtfs-dos-onibus-do-rio-de-janeiro/142895',
    formats: ['GTFS'],
    license: 'CC BY citada em discussão pública; confirmar na página do conjunto',
    coverage: 'Município do Rio de Janeiro (ônibus)',
    access: 'Portal data.rio; URL de download atual a confirmar',
    commercialUse: COMMERCIAL_USE.UNVERIFIED,
    status: INTEGRATION_STATUS.INVESTIGATED,
    notes: 'Candidato a primeira cobertura brasileira. Não validado.',
  },
  {
    id: 'sptrans-gtfs',
    name: 'SPTrans GTFS (São Paulo)',
    url: 'https://www.sptrans.com.br/desenvolvedores/',
    formats: ['GTFS'],
    license: 'Termos não confirmados',
    coverage: 'Município de São Paulo (ônibus)',
    access: 'Download exige cadastro, segundo informação não confirmada',
    commercialUse: COMMERCIAL_USE.UNVERIFIED,
    status: INTEGRATION_STATUS.INVESTIGATED,
    notes: 'Termos e URL atual a confirmar no site oficial.',
  },
  {
    id: 'osm-overpass',
    name: 'OpenStreetMap via Overpass API (campings)',
    url: 'https://www.openstreetmap.org/copyright',
    formats: ['Overpass JSON (tourism=camp_site, tourism=caravan_site)'],
    license: 'ODbL 1.0, © OpenStreetMap contributors',
    coverage: 'Mundial, conforme o mapeamento voluntário (cobertura e atualização irregulares)',
    access: 'API pública do Overpass (política de uso justo); consulta feita no navegador a cada busca',
    commercialUse: COMMERCIAL_USE.UNVERIFIED,
    status: INTEGRATION_STATUS.PREPARED,
    notes: 'Integração testada só com respostas simuladas; consulta real não validada neste ambiente. ODbL exige atribuição e pode exigir compartilhamento de bases derivadas ao combinar e redistribuir dados: revisar antes de publicar uma base própria.',
  },
  {
    id: 'work-exchange-supabase',
    name: 'Oportunidades de trabalho em troca (cadastro próprio, Supabase)',
    url: 'https://supabase.com/',
    formats: ['Tabela work_exchange_opportunities (supabase/schema.sql)'],
    license: 'Conteúdo enviado por anfitriões; termos de publicação a definir',
    coverage: 'Somente o que for cadastrado e aprovado',
    access: 'Requer projeto Supabase configurado; leitura pública apenas de registros aprovados',
    commercialUse: COMMERCIAL_USE.UNVERIFIED,
    status: INTEGRATION_STATUS.PREPARED,
    notes: 'Sem registros por padrão. Anúncios e fotos de Worldpackers, Workaway ou WWOOF não são copiados.',
  },
  {
    id: 'opentripplanner',
    name: 'OpenTripPlanner (motor de roteamento)',
    url: 'https://www.opentripplanner.org/',
    formats: ['GTFS', 'OSM', 'GTFS GraphQL API'],
    license: 'Software livre (consultar a licença do projeto)',
    coverage: 'Depende dos dados carregados',
    access: 'Serviço próprio, a ser instalado pelo dono do projeto',
    commercialUse: COMMERCIAL_USE.UNVERIFIED,
    status: INTEGRATION_STATUS.PREPARED,
    notes: 'Integração preparada; não testada contra um servidor real.',
  },
];
