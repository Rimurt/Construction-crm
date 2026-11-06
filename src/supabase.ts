import { createClient } from '@supabase/supabase-js';
import type { Snapshot, Status, Task } from './types';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
if (key && !key.startsWith('sb_publishable_')) {
  throw new Error('Нужен публичный sb_publishable_ ключ. Секретные ключи во фронтенде запрещены.');
}
if (Boolean(url) !== Boolean(key))
  throw new Error('Задайте URL Supabase и publishable key вместе.');
export const supabase = url && key ? createClient(url, key) : null;

/** JWT текущей сессии подставляет SDK; видимые строки ограничивает RLS в базе. */
export async function loadSnapshot(): Promise<Snapshot> {
  if (!supabase) throw new Error('Supabase не подключён');
  const results = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('sites').select('*').is('deleted_at', null).order('created_at'),
    supabase.from('tasks').select('*').is('deleted_at', null).order('created_at'),
    supabase.from('task_status_history').select('*').order('created_at'),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return {
    profiles: results[0].data ?? [],
    sites: results[1].data ?? [],
    tasks: results[2].data ?? [],
    history: results[3].data ?? [],
  } as Snapshot;
}

export async function changeStatus(task: Task, status: Status, comment: string) {
  if (!supabase) throw new Error('Supabase не подключён');
  // Предыдущий статус в WHERE не позволяет затереть параллельное изменение.
  const { data, error } = await supabase
    .from('tasks')
    .update({ status, status_comment: comment.trim() || null })
    .eq('id', task.id)
    .eq('status', task.status)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Задача уже изменена или доступ отозван. Обновите список.');
}
