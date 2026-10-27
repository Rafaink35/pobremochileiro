import { useEffect, useState } from 'react';
import { supabase } from '../api/supabase.js';

export function useSession() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}
