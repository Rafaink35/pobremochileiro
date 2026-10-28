// Sites de busca por categoria. Não são afiliados e não têm integração: o app só monta
// uma pesquisa no Google restrita ao site (site:domínio) com o que a pessoa digitou.
// Se algum virar programa de afiliados, troque por `affiliateUrl` e o botão passa a usá-lo.
export const searchGroups = [
  {
    id: 'bus',
    label: 'Ônibus',
    fields: ['origem', 'destino', 'data'],
    sites: [
      { name: 'Buser', domain: 'buser.com.br' },
      { name: 'ClickBus', domain: 'clickbus.com.br' },
      { name: 'Quero Passagem', domain: 'querepassagem.com' },
      { name: 'Guichê Virtual', domain: 'guichevirtual.com.br' },
    ],
    note: 'Compare o preço nos sites e digite o menor no plano.',
  },
  {
    id: 'camping',
    label: 'Camping',
    fields: ['lugar'],
    sites: [
      { name: 'Park4Night', domain: 'park4night.com' },
      { name: 'Hipcamp', domain: 'hipcamp.com' },
    ],
    note: 'Confira regras do local, taxas e se o camping é autorizado.',
  },
  {
    id: 'volunteer',
    label: 'Voluntariado',
    fields: ['lugar'],
    sites: [
      { name: 'Worldpackers', domain: 'worldpackers.com' },
      { name: 'Workaway', domain: 'workaway.info' },
      { name: 'HelpX', domain: 'helpx.net' },
    ],
    note: 'Muitos cobram mensalidade. Leia avaliações, combine horas, comida e hospedagem por escrito, e desconfie de quem pede pagamento fora da plataforma.',
  },
  {
    id: 'aupair',
    label: 'Au pair',
    fields: ['lugar'],
    sites: [
      { name: 'AuPairWorld', domain: 'aupairworld.com' },
      { name: 'Cultural Care Au Pair', domain: 'culturalcare.com' },
    ],
    note: 'Au pair exige visto e contrato específicos. Confirme as regras do país e prefira agências com registro oficial.',
  },
];

export function searchUrl(domain, query) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${query} site:${domain}`)}`;
}
