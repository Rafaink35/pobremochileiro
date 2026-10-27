import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../api/supabase.js';

export function usePosts() {
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState(supabase ? 'loading' : 'off');

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('posts')
      .select('id,user_id,author_name,type,title,body,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) setStatus('error');
    else {
      setPosts(data);
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const publish = async (session, { type, title, body }) => {
    const author = session.user.email.split('@')[0];
    const { error } = await supabase
      .from('posts')
      .insert({ user_id: session.user.id, author_name: author, type, title, body });
    if (error) throw error;
    await load();
  };

  const remove = async (id) => {
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) throw error;
    await load();
  };

  return { posts, status, publish, remove };
}
