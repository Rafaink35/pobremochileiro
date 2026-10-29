import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../api/supabase.js';
import { imagePath } from '../services/community/images.js';
import { normalizePost, postPayload } from '../services/community/postModel.js';

const COLUMNS =
  'id,user_id,author_name,type,title,body,created_at,community_id,images,place_name,tip,trip_cost_brl,trip_days,hidden,communities(name,slug)';
const BUCKET = 'post-images';

const urlFor = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

export function usePosts(communityId = null, session = null) {
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState(supabase ? 'loading' : 'off');
  const userId = session?.user?.id ?? null;

  const load = useCallback(async () => {
    if (!supabase) return;
    let query = supabase.from('posts').select(COLUMNS).order('created_at', { ascending: false }).limit(50);
    if (communityId) query = query.eq('community_id', communityId);
    const { data, error } = await query;
    if (error) {
      setStatus('error');
      return;
    }
    const ids = data.map((p) => p.id);
    const [counts, mine] = ids.length
      ? await Promise.all([
          supabase.rpc('post_like_counts', { ids }),
          userId ? supabase.from('post_likes').select('post_id').in('post_id', ids).eq('user_id', userId) : { data: [] },
        ])
      : [{ data: [] }, { data: [] }];
    const likeCounts = new Map((counts.data ?? []).map((r) => [r.post_id, Number(r.likes) || 0]));
    const likedIds = new Set((mine.data ?? []).map((r) => r.post_id));
    setPosts(data.map((row) => normalizePost(row, { likeCounts, likedIds, urlFor })));
    setStatus('ready');
  }, [communityId, userId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Envia as fotos (já reduzidas) e cria o relato. Se o insert falhar, apaga as fotos enviadas. */
  const publish = async (sess, form, blobs = [], targetCommunityId = communityId) => {
    const uploaded = [];
    try {
      for (const blob of blobs) {
        const path = imagePath(sess.user.id, crypto.randomUUID());
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (error) throw error;
        uploaded.push(path);
      }
      const author = sess.user.email.split('@')[0];
      const { error } = await supabase
        .from('posts')
        .insert({ user_id: sess.user.id, author_name: author, community_id: targetCommunityId, ...postPayload(form, uploaded) });
      if (error) throw error;
    } catch (err) {
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
      throw err;
    }
    await load();
  };

  const remove = async (id) => {
    const { data: row } = await supabase.from('posts').select('images').eq('id', id).maybeSingle();
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) throw error;
    if (row?.images?.length) await supabase.storage.from(BUCKET).remove(row.images);
    await load();
  };

  const toggleLike = async (post) => {
    const q = supabase.from('post_likes');
    const { error } = post.liked
      ? await q.delete().eq('post_id', post.id).eq('user_id', userId)
      : await q.insert({ post_id: post.id, user_id: userId });
    if (error) throw error;
    await load();
  };

  const report = async (postId, reason = '') => {
    const { error } = await supabase.from('post_reports').insert({ post_id: postId, user_id: userId, reason: reason.slice(0, 300) || null });
    if (error && error.code !== '23505') throw error; // 23505: já denunciou
  };

  return { posts, status, publish, remove, toggleLike, report, reload: load };
}
