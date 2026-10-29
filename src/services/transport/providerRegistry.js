// Registro de provedores: a interface pesquisa em todos sem conhecer nenhum fornecedor específico.
import { assertProvider, safeSearch } from './transportProvider.js';
import { createGtfsProvider } from './gtfsProvider.js';
import { createOtpProvider } from './openTripPlannerProvider.js';

export function createProviderRegistry() {
  const providers = new Map();
  return {
    register(provider) {
      assertProvider(provider);
      providers.set(provider.id, provider);
      return this;
    },
    unregister: (id) => providers.delete(id),
    get: (id) => providers.get(id),
    list: () => [...providers.values()],
    /** Busca em todos os provedores; falha de um não afeta os outros. */
    async searchAll(query, options) {
      const list = [...providers.values()];
      const results = await Promise.all(list.map((p) => safeSearch(p, query, options)));
      return list.map((p, i) => ({ providerId: p.id, providerName: p.name, ...results[i] }));
    },
  };
}

// Instância da aplicação. Variáveis VITE_* são públicas: só URLs sem segredo.
export const gtfsProvider = createGtfsProvider();
export const providerRegistry = createProviderRegistry()
  .register(gtfsProvider)
  .register(createOtpProvider({ baseUrl: import.meta.env?.VITE_ROUTING_API_BASE_URL ?? '' }));
