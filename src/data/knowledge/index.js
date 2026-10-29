// Base de conhecimento carregada pelo app. Está VAZIA de propósito: só entra dado real, com fonte, licença e data
// (ver docs/trip-engine.md). Sem dados, a tela "Descubra" mostra um estado vazio, nunca ofertas de exemplo.
import raw from './base.json';
import { loadKnowledgeBase } from '../../services/trip/knowledge.js';

export const { kb: knowledgeBase, errors: knowledgeErrors, warnings: knowledgeWarnings } = loadKnowledgeBase(raw);
