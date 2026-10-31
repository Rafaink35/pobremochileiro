import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Os testes que desenham componentes (react-dom/server) precisam do runtime automático do JSX.
  esbuild: { jsx: 'automatic' },
});
