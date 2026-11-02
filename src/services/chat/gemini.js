// Provedor Gemini (REST, sem SDK) para o chat. Mesmo contrato do provedor Anthropic: usa as mesmas ferramentas
// (dados reais + verificação de valores) e emite os mesmos eventos NDJSON. A chave fica só no servidor.
import { findUnverifiedAmounts } from './amounts.js';

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest'; // alias que acompanha o Flash mais novo; fixe um nome estável em GEMINI_MODEL se preferir
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** O Gemini aceita um subconjunto do JSON Schema: tipos em MAIÚSCULAS, sem listas de tipos nem additionalProperties. */
export function toGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'additionalProperties' || k === '$schema') continue;
    if (k === 'type') {
      const list = Array.isArray(v) ? v : [v];
      const real = list.find((t) => t !== 'null') ?? 'string';
      out.type = String(real).toUpperCase();
      if (list.includes('null')) out.nullable = true;
    } else if (k === 'properties') {
      out.properties = Object.fromEntries(Object.entries(v).map(([name, s]) => [name, toGeminiSchema(s)]));
    } else if (k === 'items') out.items = toGeminiSchema(v);
    else out[k] = v;
  }
  return out;
}

export function toGeminiTools(definitions) {
  return [
    {
      functionDeclarations: definitions.map((d) => {
        const hasProps = d.input_schema?.properties && Object.keys(d.input_schema.properties).length > 0;
        return { name: d.name, description: d.description, ...(hasProps && { parameters: toGeminiSchema(d.input_schema) }) };
      }),
    },
  ];
}

const toContents = (history) => history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

export function geminiErrorMessage(status) {
  if (status === 429) return 'o limite do Gemini foi atingido agora; tente de novo em alguns minutos';
  if (status === 400 || status === 403) return 'a chave do Gemini foi recusada ou o pedido é inválido';
  if (status === 404) return 'o modelo do Gemini não foi encontrado; confira GEMINI_MODEL no servidor (valor sugerido: gemini-flash-latest)';
  return 'a IA está indisponível agora';
}

/** Roda o laço de ferramentas. Devolve { finished, spoken, usage }; emite eventos via `send`. */
export async function runGemini({ env, fetchImpl, model, system, history, definitions, toolbox, send, maxTurns = 8, maxTokens = 4000 }) {
  const contents = toContents(history);
  const tools = toGeminiTools(definitions);
  const usage = { input: 0, output: 0 };
  let spoken = '';
  let sentProposals = 0;
  let finished = false;

  for (let turn = 0; turn < maxTurns && !finished; turn += 1) {
    const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools,
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) {
      send({ type: 'error', message: geminiErrorMessage(res.status), detail: `gemini ${res.status}` });
      return { finished: true, spoken, usage };
    }
    const data = await res.json();
    usage.input += data.usageMetadata?.promptTokenCount ?? 0;
    usage.output += data.usageMetadata?.candidatesTokenCount ?? 0;
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    if (!candidate || (parts.length === 0 && candidate.finishReason !== 'STOP')) {
      send({ type: 'error', message: data.promptFeedback?.blockReason ? 'a IA recusou esta solicitação' : 'a IA não devolveu resposta' });
      return { finished: true, spoken, usage };
    }

    const text = parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
    if (text) {
      spoken += text;
      send({ type: 'text', delta: text });
    }
    const calls = parts.filter((p) => p.functionCall);
    if (candidate.finishReason === 'MAX_TOKENS') {
      send({ type: 'error', message: 'a resposta foi cortada; peça de novo com mais detalhe' });
      return { finished: true, spoken, usage };
    }
    if (calls.length) {
      contents.push({ role: 'model', parts }); // devolve o conteúdo inteiro, sem editar (preserva assinaturas de raciocínio)
      const responses = [];
      for (const { functionCall } of calls) {
        send({ type: 'tool', name: functionCall.name });
        const out = await toolbox.run(functionCall.name, functionCall.args ?? {});
        responses.push({ functionResponse: { name: functionCall.name, response: out?.error ? { error: out.error } : { result: out } } });
      }
      contents.push({ role: 'user', parts: responses });
      if (toolbox.proposals.length > sentProposals) {
        send({ type: 'proposal', items: toolbox.proposals.slice(sentProposals) });
        sentProposals = toolbox.proposals.length;
      }
    } else {
      finished = true;
      const bad = findUnverifiedAmounts(spoken, toolbox.allowedAmounts());
      if (bad.length) send({ type: 'warning', amounts: bad, message: 'A resposta citou valores sem fonte confirmada. Não confie neles.' });
    }
  }
  return { finished, spoken, usage };
}
