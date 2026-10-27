import { useEffect, useState } from 'react';

/**
 * Estado que persiste no localStorage do navegador (por dispositivo/navegador,
 * sem conta nem servidor). Se o storage estiver indisponível (modo privado,
 * bloqueio do navegador etc.) cai de volta para estado em memória, sem
 * quebrar a tela.
 */
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Armazenamento indisponível: a sessão continua funcionando em memória.
    }
  }, [key, value]);

  return [value, setValue];
}
