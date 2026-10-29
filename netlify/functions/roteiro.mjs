// Assistente de roteiro barato (Claude API). Roda só no servidor: ANTHROPIC_API_KEY nunca vai ao navegador.
// A IA só monta o roteiro com dados devolvidos pelas ferramentas; valores sem fonte são descartados (verify.js).
import Anthropic from '@anthropic-ai/sdk';
import { TOOL_DEFINITIONS, createToolbox } from '../../src/services/roteiro/tools.js';
import { extractJson, verifyRoteiro } from '../../src/services/roteiro/verify.js';

const MAX_TURNS = 6;
const MAX_TOKENS = 4000;
const DEFAULT_MODEL = 'claude-opus-5-5'; // troque com ROTEIRO_MODEL (ex.: claude-sonnet-5-5) para gastar menos

const SYSTEM = `Você é o assistente de roteiro do Pobre Mochileiro: monta o roteiro mais barato possível para quem viaja com pouco dinheiro. Responda sempre em português do Brasil.

Regras inegociáveis:
- Todo valor em reais deve vir de um resultado de ferramenta. Cite o "id" do resultado em "fonte_id" e copie o valor exatamente (total_brl, price_brl). Nunca estime, arredonde ou invente preço.
- Se uma informação não existe nos resultados (hospedagem, comida, ônibus, passeios), coloque "valor_brl": null e liste em "faltando". Não preencha lacunas com médias suas.
- Preços de voo são de cache (até 48h); campings do OpenStreetMap não garantem que o local está aberto. Diga isso em "avisos".
- Prefira economizar de verdade: compare meses, aeroportos e opções gratuitas ou de troca de trabalho, mas só cite o que as ferramentas devolveram.
- Para ônibus, trem e comida, você não tem fonte: deixe "valor_brl": null e peça ao viajante que preencha.

Termine com UM objeto JSON, sem texto fora dele, neste formato:
{"resumo": string, "itens": [{"categoria": "Transporte|Hospedagem|Comida|Passeios|Extras", "descricao": string, "fonte_id": string|null, "valor_brl": number|null, "observacao": string}], "faltando": [string], "avisos": [string]}`;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const usageByUser = new Map(); // limite por usuário/dia, por instância: freio simples, não substitui o limite de gasto no Console

async function verifyUser(request, env, fetchImpl) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  const res = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id ?? null;
}

function buildPrompt(b) {
  const lines = [
    `Origem: ${b.origin || 'não informada'}`,
    `Destino: ${b.destination}`,
    `Dias: ${b.days || 'não informado'}`,
    `Passageiros: ${b.adults || 1}`,
    `Orçamento total (R$): ${b.budget ?? 'não informado'}`,
    `Mês/época: ${b.month || 'flexível'}`,
    `Preferências: ${b.notes || 'nenhuma'}`,
  ];
  return `Monte o roteiro mais barato para esta viagem.\n${lines.join('\n')}`;
}

export function createRoteiroHandler({
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

    const day = now().toISOString().slice(0, 10);
    const limit = Number(env.ROTEIRO_DAILY_LIMIT) || 5;
    const used = usageByUser.get(userId);
    const count = used?.day === day ? used.count : 0;
    if (count >= limit) return json(429, { error: `limite de ${limit} roteiros por dia atingido` });

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'corpo inválido' });
    }
    const destination = String(body?.destination ?? '').trim();
    if (destination.length < 2 || destination.length > 80) return json(400, { error: 'informe o destino' });
    const clean = {
      origin: String(body.origin ?? '').slice(0, 80),
      destination,
      days: Math.min(60, Math.max(1, Number(body.days) || 0)) || null,
      adults: Math.min(9, Math.max(1, Number(body.adults) || 1)),
      budget: Number.isFinite(Number(body.budget)) && Number(body.budget) > 0 ? Number(body.budget) : null,
      month: /^\d{4}-\d{2}$/.test(body.month ?? '') ? body.month : '',
      notes: String(body.notes ?? '').slice(0, 400),
    };

    usageByUser.set(userId, { day, count: count + 1 });
    const toolbox = createToolbox({ env, fetchImpl, now });
    const client = makeClient();
    const messages = [{ role: 'user', content: buildPrompt(clean) }];
    const usage = { input: 0, output: 0 };
    let final = null;

    try {
      for (let turn = 0; turn < MAX_TURNS; turn += 1) {
        const response = await client.messages.create({
          model: env.ROTEIRO_MODEL || DEFAULT_MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM,
          tools: TOOL_DEFINITIONS,
          messages,
        });
        usage.input += response.usage?.input_tokens ?? 0;
        usage.output += response.usage?.output_tokens ?? 0;

        if (response.stop_reason === 'refusal') return json(422, { error: 'a IA recusou esta solicitação' });
        if (response.stop_reason === 'max_tokens') return json(502, { error: 'resposta da IA cortada; tente de novo' });
        if (response.stop_reason === 'tool_use') {
          messages.push({ role: 'assistant', content: response.content }); // devolve o conteúdo inteiro, sem editar
          const results = [];
          for (const block of response.content.filter((b) => b.type === 'tool_use')) {
            const out = await toolbox.run(block.name, block.input);
            results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out), ...(out.error && { is_error: true }) });
          }
          messages.push({ role: 'user', content: results });
          continue;
        }
        final = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
        break;
      }
    } catch (err) {
      return json(502, { error: 'a IA está indisponível agora', detail: err?.message?.slice(0, 120) });
    }

    const parsed = extractJson(final);
    if (!parsed) return json(502, { error: 'não foi possível ler o roteiro gerado; tente de novo' });
    return json(200, { roteiro: verifyRoteiro(parsed, toolbox.sources, clean.budget), usage, model: env.ROTEIRO_MODEL || DEFAULT_MODEL });
  };
}

export default createRoteiroHandler();
