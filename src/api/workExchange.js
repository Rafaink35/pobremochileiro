import { supabase } from './supabase.js';

// Lê apenas oportunidades aprovadas (a política RLS do banco já restringe; o filtro aqui é defesa extra).
export async function fetchApprovedOpportunities() {
  if (!supabase) return { status: 'off', rows: [] };
  const { data, error } = await supabase
    .from('work_exchange_opportunities')
    .select('*')
    .eq('status', 'approved')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) return { status: 'error', rows: [], message: error.message };
  return { status: 'ready', rows: data ?? [] };
}
