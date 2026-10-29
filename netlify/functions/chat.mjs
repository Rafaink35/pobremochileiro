// Chat do assistente de viagem barata, com streaming (NDJSON). Roda só no servidor.
// A IA usa ferramentas com dados reais; valores citados sem fonte geram um aviso (amounts.js) e os itens
// propostos ao plano só carregam valor verificado (verify.js). O usuário decide o que entra no plano.
import Anthropic from '@anthropic-ai/sdk';
import { CHAT_TOOL_DEFINITIONS, TOOL_DEFINITIONS, createToolbox } from '../../src/services/roteiro/tools.js';
import { createDailyLimiter, verifyUser } from '../../src/services/roteiro/auth.js';
import { extractUserNumbers, findUnverifiedAmounts } from '../../src/services/chat/amounts.js';

const MAX_TURNS = 8;
const MAX_TOKENS = 4000;
const MAX_HISTORY = 12;
const DEFAULT_MODEL = 'claude-opus-5-5'; // CHAT_MODEL=claude-sonnet-5-5 custa menos

const SYSTEM = `Você é o assistente do Pobre Mochileiro: ajuda quem viaja com pouco dinheiro a montar o plano mais barato possível. Conversa em português do Brasil, de forma curta e direta.

Regras inegociáveis:
- Todo valor em reais que você escrever deve vir de um resultado de ferramenta, do plano do usuário (get_plan) ou de algo que o usuário disse (use record_user_value). Copie o valor exatamente. Nunca estime, arredonde nem some de cabeça: para totais use o que get_plan ou propose_plan_items devolvem.
- Se não houver fonte (ônibus, comida, hospedagem sem preço), diga que não tem o valor e pergunte ao usuário. Não preencha com médias suas.
- Preços de voo são de cache (até 48h); campings do OpenStreetMap não garantem que o local está aberto. Avise quando isso importar.
- Não afirme que algo cabe no orçamento se faltar valor; diga o que falta.
- Para sugerir itens ao plano use propose_plan_items; o usuário escolhe o que adicionar. Você não altera o plano sozinho.
- Faça no máximo uma ou duas perguntas por vez e só quando precisar delas.`;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const limiter = createDailyLimiter();

function sanitizeHistory(raw) {
  const clean = (Array.isArray(raw) ? raw : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-MAX_HISTORY);
  while (clean.length && clean[0].role !== 'user') clean.shift();
  return clean.at(-1)?.role === 'user' ? clean : [];
}

function sanitizePlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    budget: typeof raw.budget === 'string' ? raw.budget.slice(0, 20) : '',
    items: (Array.isArray(raw.items) ? raw.items : []).slice(0, 40).map((i) => ({
      category: String(i.category ?? '').slice(0, 20), label: String(i.label ?? '').slice(0, 100), amount: String(i.amount ?? '').slice(0, 20),
    })),
    stays: (Array.isArray(raw.stays) ? raw.stays : []).slice(0, 10).map((s) => ({
      name: String(s.name ?? '').slice(0, 100), kind: String(s.kind ?? ''),
      cost: { status: String(s.cost?.status ?? 'unknown') }, transport: { status: String(s.transport?.status ?? 'not_calculated') },
    })),
  };
}

export function createChatHandler({
  env = process.env,
  fetchImpl = (...a) => fetch(...a),
  makeClient = () => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }),
  now = () => new Date(),
} = {}) {
  return async function handler(request) {
    if (request.method !== 'POST') return json(405, { error: 'use POST' });
    if (!env.ANTHROPIC_API_KEY) return json(503, { error: 'assistente ainda não configurado' });
    const userId = await verifyUser(request, env, fetchImpl).catch(() => null);
    if (!userId) return json(401, { error: 'entre na sua conta para usar o assistente' });

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'corpo inválido' });
    }
    const history = sanitizeHistory(body?.messages);
    if (!history.length) return json(400, { error: 'envie uma mensagem' });
    const limit = Number(env.CHAT_DAILY_LIMIT) || 30;
    if (!limiter.take(userId, now().toISOString().slice(0, 10), limit)) return json(429, { error: `limite de ${limit} mensagens por dia atingido` });

    const plan = sanitizePlan(body.plan);
    const userNumbers = history.filter((m) => m.role === 'user').flatMap((m) => extractUserNumbers(m.content));
    const planNumber = Number(String(plan?.budget ?? '').replace(/\./g, '').replace(',', '.'));
    const toolbox = createToolbox({ env, fetchImpl, now, plan, extraAllowed: [...userNumbers, ...(Number.isFinite(planNumber) ? [planNumber] : [])] });
    const model = env.CHAT_MODEL || DEFAULT_MODEL;
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        const messages = [...history];
        const usage = { input: 0, output: 0 };
        let spoken = '';
        let sentProposals = 0;
        try {
          const client = makeClient();
          let finished = false;
          for (let turn = 0; turn < MAX_TURNS && !finished; turn += 1) {
            const s = client.messages.stream({
              model, max_tokens: MAX_TOKENS, system: SYSTEM, tools: [...TOOL_DEFINITIONS, ...CHAT_TOOL_DEFINITIONS], messages,
            });
            s.on('text', (delta) => {
              spoken += delta;
              send({ type: 'text', delta });
            });
            const response = await s.finalMessage();
            usage.input += response.usage?.input_tokens ?? 0;
            usage.output += response.usage?.output_tokens ?? 0;

            if (response.stop_reason === 'refusal') {
              send({ type: 'error', message: 'a IA recusou esta solicitação' });
              finished = true;
            } else if (response.stop_reason === 'max_tokens') {
              send({ type: 'error', message: 'a resposta foi cortada; peça de novo com mais detalhe' });
              finished = true;
            } else if (response.stop_reason === 'tool_use') {
              messages.push({ role: 'assistant', content: response.content }); // devolve o conteúdo inteiro, sem editar
              const results = [];
              for (const block of response.content.filter((b) => b.type === 'tool_use')) {
                send({ type: 'tool', name: block.name });
                const out = await toolbox.run(block.name, block.input);
                results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out), ...(out.error && { is_error: true }) });
              }
              messages.push({ role: 'user', content: results });
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
          if (!finished) send({ type: 'error', message: 'a conversa ficou longa demais para esta pergunta; tente algo mais simples' });
          send({ type: 'done', usage, model });
        } catch (err) {
          send({ type: 'error', message: 'a IA está indisponível agora', detail: String(err?.message ?? '').slice(0, 120) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
    });
  };
}

export default createChatHandler();
