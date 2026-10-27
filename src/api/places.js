// Busca de lugares reais (foto + resumo) na Wikipédia em português. API pública, sem chave.
export async function searchPlaces(term, signal) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: term,
    gsrlimit: '8',
    prop: 'pageimages|extracts|info',
    piprop: 'thumbnail',
    pithumbsize: '700',
    exintro: '1',
    explaintext: '1',
    exchars: '240',
    inprop: 'url',
  });
  const res = await fetch(`https://pt.wikipedia.org/w/api.php?${params}`, { signal });
  if (!res.ok) throw new Error(`wikipédia ${res.status}`);
  const json = await res.json();
  return Object.values(json.query?.pages ?? {})
    .sort((a, b) => a.index - b.index)
    .map((p) => ({
      id: p.pageid,
      title: p.title,
      extract: p.extract || '',
      image: p.thumbnail?.source || null,
      url: p.fullurl,
    }));
}
