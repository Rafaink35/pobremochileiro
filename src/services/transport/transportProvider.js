// Contrato comum dos provedores de transporte. A interface não conhece fornecedores específicos.

export const SEARCH_STATUS = Object.freeze({
  OK: 'ok',
  EMPTY: 'empty', // fonte respondeu, sem rota
  NOT_CONFIGURED: 'not_configured', // fonte sem endpoint/dados configurados
  UNAVAILABLE: 'unavailable', // erro de rede, timeout ou resposta inválida
});

/**
 * Um provedor implementa:
 *   id: string
 *   name: string
 *   getSource(): metadados (ver sourceMetadata.createSourceMetadata) ou null
 *   isConfigured(): boolean
 *   search({ origin, destination, date }): Promise<{ status, options, source, message? }>
 */
export function assertProvider(provider) {
  const missing = ['id', 'name', 'getSource', 'isConfigured', 'search'].filter((k) => {
    const v = provider?.[k];
    return k === 'id' || k === 'name' ? typeof v !== 'string' || !v : typeof v !== 'function';
  });
  if (missing.length) throw new Error(`Provedor inválido: faltam ${missing.join(', ')}`);
  return provider;
}

/** Resposta padronizada de busca. */
export function searchResult(status, { options = [], source = null, message = null } = {}) {
  return { status, options, source, message };
}

/** Executa a busca de um provedor garantindo que erros viram `unavailable`, sem derrubar a aplicação. */
export async function safeSearch(provider, query, { timeoutMs = 15000 } = {}) {
  try {
    if (!provider.isConfigured()) {
      return searchResult(SEARCH_STATUS.NOT_CONFIGURED, {
        source: provider.getSource(),
        message: 'Fonte ainda não configurada.',
      });
    }
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('tempo esgotado')), timeoutMs);
    });
    try {
      return await Promise.race([provider.search(query), timeout]);
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    return searchResult(SEARCH_STATUS.UNAVAILABLE, {
      source: provider.getSource?.() ?? null,
      message: err?.message ? `Fonte indisponível: ${err.message}` : 'Fonte indisponível.',
    });
  }
}
