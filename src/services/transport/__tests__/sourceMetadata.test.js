import { describe, expect, it } from 'vitest';
import {
  attributionText,
  COMMERCIAL_USE,
  createSourceMetadata,
  INVESTIGATED_SOURCES,
  INTEGRATION_STATUS,
  isPublishable,
} from '../sourceMetadata.js';

describe('metadados de fonte', () => {
  it('uso comercial começa como não verificado', () => {
    const m = createSourceMetadata({ name: 'X', url: 'https://x', license: 'CC BY 4.0', attribution: 'X' });
    expect(m.commercialUse).toBe(COMMERCIAL_USE.UNVERIFIED);
    expect(isPublishable(m)).toBe(false);
    expect(m.issues.join(' ')).toMatch(/Uso comercial ainda não verificado/);
  });
  it('ODbL exige revisão de bases derivadas', () => {
    const m = createSourceMetadata({
      name: 'Y', url: 'https://y', license: 'ODbL', attribution: 'Y', obtainedAt: '2026-10-01', commercialUse: 'allowed',
    });
    expect(m.shareAlikeReview).toBe(true);
    expect(isPublishable(m)).toBe(false);
  });
  it('fonte completa com uso permitido é publicável', () => {
    const m = createSourceMetadata({
      name: 'Z', url: 'https://z', license: 'CC BY 4.0', attribution: 'Prefeitura Z', obtainedAt: '2026-10-01', commercialUse: 'allowed',
    });
    expect(isPublishable(m)).toBe(true);
  });
  it('sem licença ou atribuição é sinalizado e campos vazios viram null', () => {
    const m = createSourceMetadata({ name: '  ' });
    expect(m.name).toBeNull();
    expect(m.license).toBeNull();
    expect(m.issues.length).toBeGreaterThan(3);
  });
  it('texto de atribuição inclui licença e data', () => {
    const m = createSourceMetadata({ name: 'Z', license: 'CC BY 4.0', attribution: 'Prefeitura Z', updatedAt: '2026-09-30T00:00:00Z' });
    expect(attributionText(m)).toBe('Prefeitura Z · Licença: CC BY 4.0 · Atualizado em 2026-09-30');
  });
  it('nenhuma fonte investigada está marcada como integração funcionando nem com uso comercial liberado', () => {
    for (const s of INVESTIGATED_SOURCES) {
      expect(s.status).not.toBe(INTEGRATION_STATUS.WORKING);
      expect(s.commercialUse).not.toBe(COMMERCIAL_USE.ALLOWED);
      expect(s.url).toMatch(/^https:\/\//);
    }
  });
});
