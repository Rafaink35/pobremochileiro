// Base de conhecimento carregada pelo app. Em PRODUÇÃO ela vem só de `base.json`, que hoje está VAZIA de propósito:
// só entra dado real, com fonte, licença e data (ver docs/trip-engine.md). Os 5 cenários editoriais são FIXTURES de
// desenvolvimento e testes (src/services/trip/__tests__/fixtures) e só carregam em `npm run dev` com VITE_USE_FIXTURES=1;
// além disso, `guardProductionKnowledgeBase` descarta qualquer base com fonte fixture em produção.
import raw from './base.json';
import { guardProductionKnowledgeBase, loadKnowledgeBase } from '../../services/trip/knowledge.js';

let loaded = loadKnowledgeBase(raw);
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIXTURES === '1') {
  loaded = loadKnowledgeBase((await import('../../services/trip/__tests__/fixtures/five-scenarios.json')).default);
}
const guarded = guardProductionKnowledgeBase(loaded.kb, { production: !import.meta.env.DEV });

export const knowledgeBase = guarded.kb;
export const knowledgeErrors = guarded.blocked ? [...loaded.errors, guarded.reason] : loaded.errors;
export const knowledgeWarnings = loaded.warnings;
