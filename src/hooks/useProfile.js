import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../api/supabase.js';
import { normalizeProfile, profileErrorMessage, profilePayload } from '../services/profile/model.js';

const BUCKET = 'post-images';

// Perfil da pessoa logada: carregar, criar, editar e apagar a conta.
export function useProfile(session) {
  const userId = session?.user?.id ?? null;
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(supabase ? 'loading' : 'off'); // off | loading | ready | error

  const load = useCallback(async () => {
    if (!supabase) return;
    if (!userId) {
      setProfile(null);
      setStatus('ready');
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (error) {
      setStatus('error');
      return;
    }
    setProfile(normalizeProfile(data));
    setStatus('ready');
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Cria (creating) ou edita o perfil. Lança Error com mensagem em português. */
  const save = async (form, { creating = false } = {}) => {
    const payload = profilePayload(form, { creating });
    const query = creating
      ? supabase.from('profiles').insert({ id: userId, ...payload })
      : supabase.from('profiles').update(payload).eq('id', userId);
    const { error } = await query;
    if (error) throw new Error(profileErrorMessage(error));
    await load();
  };

  /** Apaga as fotos dos relatos, depois a conta (e, em cascata, perfil, relatos, curtidas e comentários). */
  const deleteAccount = async () => {
    const { data: posts } = await supabase.from('posts').select('images').eq('user_id', userId);
    const paths = (posts ?? []).flatMap((p) => p.images ?? []);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) throw new Error('Não foi possível apagar a conta agora. Tente de novo ou fale com a moderação.');
    await supabase.auth.signOut();
  };

  return { profile, status, save, deleteAccount, reload: load };
}
