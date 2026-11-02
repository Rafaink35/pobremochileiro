import { describe, expect, it } from 'vitest';
import { airlineName } from '../airlines.js';

describe('nome da companhia aérea', () => {
  it('traduz código conhecido, mantém o desconhecido e aceita vazio', () => {
    expect(airlineName('tp')).toBe('TAP Air Portugal (TP)');
    expect(airlineName('ZZ')).toBe('ZZ');
    expect(airlineName(null)).toBe('');
  });
});
