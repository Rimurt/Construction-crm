import type { History, Status, Task } from './types';

export const actionLabels: Partial<Record<Status, string>> = {
  in_progress: 'Взять в работу',
  review: 'Отправить на проверку',
  accepted: 'Принять работу',
  rework: 'Вернуть на доработку',
};
export const formatDate = (value: string) =>
  new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
export const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');

/** История — источник времени смены статуса; редактирование описания его не меняет. */
export function lastStatusUpdate(task: Task, history: History[]): string {
  return history.reduce(
    (latest, item) =>
      item.task_id === task.id && Date.parse(item.created_at) > Date.parse(latest)
        ? item.created_at
        : latest,
    task.created_at,
  );
}
