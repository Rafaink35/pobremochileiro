import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../api/supabase.js';
import { countsToMap, normalizeCommunities } from '../services/community/model.js';

export function useCommunities(session) {
  const [communities, setCommunities] = useState([]);
  const [status, setStatus] = useState(supabase ? 'loading' : 'off');
  const userId = session?.user?.id ?? null;

  const load = useCallback(async () => {
    if (!supabase) return;
    const [list, counts, mine] = await Promise.all([
      supabase.from('communities').select('id,slug,name,description,kind'),
      supabase.rpc('community_member_counts'),
      userId ? supabase.from('community_members').select('community_id').eq('user_id', userId) : { data: [], error: null },
    ]);
    if (list.error) {
      setStatus('error');
      return;
    }
    const joined = new Set((mine.data ?? []).map((m) => m.community_id));
    setCommunities(normalizeCommunities(list.data, countsToMap(counts.data), joined));
    setStatus('ready');
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const join = async (communityId) => {
    const { error } = await supabase.from('community_members').insert({ community_id: communityId, user_id: userId });
    if (error) throw error;
    await load();
  };
  const leave = async (communityId) => {
    const { error } = await supabase.from('community_members').delete().eq('community_id', communityId).eq('user_id', userId);
    if (error) throw error;
    await load();
  };

  return { communities, status, join, leave };
}
