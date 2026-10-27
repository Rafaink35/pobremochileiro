import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Sem as variáveis o app segue funcionando em modo demonstração (sem conta).
// detectSessionInUrl desligado: o app usa o hash da URL para rotas e o login é por código de e-mail.
export const supabase = url && key ? createClient(url, key, { auth: { detectSessionInUrl: false } }) : null;
export const hasBackend = Boolean(supabase);
