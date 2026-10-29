// Lê uma resposta NDJSON em streaming (um objeto JSON por linha). Linhas inválidas são ignoradas.
export async function* readNdjson(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      try {
        yield JSON.parse(line);
      } catch {
        // linha cortada ou inválida: ignora
      }
    }
  }
  const rest = buffer.trim();
  if (rest) {
    try {
      yield JSON.parse(rest);
    } catch {
      // ignora
    }
  }
}

/** Aplica um evento do servidor ao estado da conversa (função pura, para a interface e para testes). */
export function applyChatEvent(state, event) {
  switch (event.type) {
    case 'text':
      return { ...state, text: state.text + event.delta, status: '' };
    case 'tool':
      return { ...state, status: TOOL_LABELS[event.name] ?? 'Consultando fontes…' };
    case 'proposal':
      return { ...state, proposals: [...state.proposals, ...event.items] };
    case 'warning':
      return { ...state, warning: event.message };
    case 'error':
      return { ...state, error: event.message, status: '' };
    case 'done':
      return { ...state, done: true, status: '' };
    default:
      return state;
  }
}

export const TOOL_LABELS = {
  get_fx_rate: 'Consultando o câmbio…',
  search_flights: 'Buscando voos…',
  search_flex_dates: 'Comparando datas…',
  compare_combo: 'Comparando combos de ônibus e voo…',
  search_campings: 'Procurando campings…',
  list_work_exchange: 'Procurando trabalho em troca…',
  get_plan: 'Lendo o seu plano…',
  record_user_value: 'Anotando o valor que você informou…',
  propose_plan_items: 'Montando sugestões para o plano…',
};

export const emptyAssistantState = () => ({ text: '', status: '', proposals: [], warning: '', error: '', done: false });
