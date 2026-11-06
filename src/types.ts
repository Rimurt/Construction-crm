export type Role = 'manager' | 'executor';
export type Status = 'new' | 'in_progress' | 'review' | 'accepted' | 'rework';
export type Profile = { id: string; full_name: string; role: Role };
export type Site = { id: string; name: string; address: string; created_at: string };
export type Task = {
  id: string;
  title: string;
  description: string;
  site_id: string;
  assignee_id: string;
  status: Status;
  status_comment: string | null;
  created_by: string;
  created_at: string;
};
export type History = {
  id: string;
  task_id: string;
  actor_id: string;
  from_status: Status | null;
  to_status: Status;
  comment: string | null;
  created_at: string;
};
export type Snapshot = { profiles: Profile[]; sites: Site[]; tasks: Task[]; history: History[] };

export const statusLabels: Record<Status, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
};

/** Только представление кнопок. В Supabase те же правила независимо проверяет триггер. */
export function availableActions(task: Task, user: Profile): Status[] {
  if (user.role === 'manager') return task.status === 'review' ? ['accepted', 'rework'] : [];
  if (task.assignee_id !== user.id) return [];
  if (task.status === 'new' || task.status === 'rework') return ['in_progress'];
  return task.status === 'in_progress' ? ['review'] : [];
}
