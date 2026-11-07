// Adaptador do Stay Finder para o motor central de deduplicação (`src/services/dedupe/engine.js`), etapa E2.
// Faz o que é ESPECÍFICO da resposta do Stay Finder e não pertence ao núcleo: monta o item do grupo (campos só do principal, fontes
// somadas sem repetir, preços de todos os membros, selos de registro) no MESMO formato de sempre. Nada foi mudado:
// a agregação de preços do grupo (`prices = members.flatMap(...)`) continua sendo a exceção de transição TE da especificação, e
// nenhuma oferta, preço ou disponibilidade é movido, filtrado ou reescrito aqui.
// Só este adaptador está ativo. O chat segue com o algoritmo próprio (`lodging/lodgingModel.js`); a convergência é da E14.
import { cluster } from '../dedupe/engine.js';

/**
 * Registros do Stay Finder → grupos, no formato público atual:
 * { ...principal, sources, prices, registries, groupSize, groupReasons, memberIds, possibleDuplicates }.
 * Nada é apagado nem tem campos misturados entre fontes (licenças diferentes): só o principal fornece os campos exibidos.
 */
export function groupStayRecords(records) {
  return cluster(records).map(({ primary, members, memberIds, reasons, possibleDuplicateIds }) => {
    const sources = [];
    for (const m of members) for (const s of m.sources) if (!sources.some((x) => x.provider === s.provider && x.originalId === s.originalId)) sources.push(s);
    const prices = members.flatMap((m) => m.prices ?? []);
    return {
      ...primary,
      sources,
      prices,
      registries: [...new Set(members.map((m) => m.registry).filter(Boolean))],
      groupSize: members.length,
      groupReasons: reasons.map((r) => r.text),
      memberIds,
      possibleDuplicates: possibleDuplicateIds,
    };
  });
}
