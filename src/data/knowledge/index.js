// Base de conhecimento carregada pelo app: hoje só estimativas editoriais rotuladas (fonte "pm-editorial"), sem preço de fonte.
// Preço real entra com fonte, licença e data (ver docs/trip-engine.md). Se a base ficar vazia, a tela mostra um estado vazio.
import raw from './base.json';
import { loadKnowledgeBase } from '../../services/trip/knowledge.js';

export const { kb: knowledgeBase, errors: knowledgeErrors, warnings: knowledgeWarnings } = loadKnowledgeBase(raw);
