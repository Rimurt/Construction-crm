import { ArrowUpRight, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import Dialog from './Dialog';
import { actionLabels, formatDate, lastStatusUpdate } from '../presentation';
import {
  availableActions,
  statusLabels,
  type History,
  type Profile,
  type Status,
  type Task,
} from '../types';

type Props = {
  task: Task;
  user: Profile;
  history: History[];
  nameOf: (id: string) => string;
  siteName: (id: string) => string;
  comment: string;
  busy: boolean;
  error: string;
  notice: string;
  onCommentChange: (value: string) => void;
  onTransition: (status: Status) => Promise<void>;
  onEdit: () => void;
  onArchive: () => Promise<void>;
  onClose: () => void;
};

/** Карточка показывает доступные действия; их исполнение и проверка базы находятся выше. */
export default function TaskDetails({
  task,
  user,
  history,
  nameOf,
  siteName,
  comment,
  busy,
  error,
  notice,
  onCommentChange,
  onTransition,
  onEdit,
  onArchive,
  onClose,
}: Props) {
  const manager = user.role === 'manager';
  return (
    <Dialog title="КАРТОЧКА ЗАДАЧИ" wide close={onClose}>
      <div className="task-detail">
        <span className={`badge ${task.status}`}>
          <i />
          {statusLabels[task.status]}
        </span>
        <h2>{task.title}</h2>
        <p className="detail-description">{task.description || 'Описание не добавлено.'}</p>
        <section className="task-comments" aria-label="Комментарии к задаче">
          <h3>Комментарии</h3>
          {history.some((item) => item.task_id === task.id && item.comment?.trim()) ? (
            <div className="task-comments-list">
              {history
                .filter((item) => item.task_id === task.id && item.comment?.trim())
                .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
                .map((item) => (
                  <article className="task-comment" key={item.id}>
                    <header>
                      <strong>{nameOf(item.actor_id)}</strong>
                      <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
                    </header>
                    <p>{item.comment}</p>
                  </article>
                ))}
            </div>
          ) : (
            <p className="comments-empty">Комментариев пока нет.</p>
          )}
        </section>
        <dl>
          <div>
            <dt>Объект</dt>
            <dd>{siteName(task.site_id)}</dd>
          </div>
          <div>
            <dt>Исполнитель</dt>
            <dd>{nameOf(task.assignee_id)}</dd>
          </div>
          <div>
            <dt>Постановщик</dt>
            <dd>{nameOf(task.created_by)}</dd>
          </div>
          <div>
            <dt>Создана</dt>
            <dd>{formatDate(task.created_at)}</dd>
          </div>
          <div>
            <dt>Последняя смена статуса</dt>
            <dd>
              <time dateTime={lastStatusUpdate(task, history)}>
                {formatDate(lastStatusUpdate(task, history))}
              </time>
            </dd>
          </div>
        </dl>
        {availableActions(task, user).length > 0 && (
          <div className="action-panel">
            <h3>{manager ? 'Решение по задаче' : 'Следующий шаг'}</h3>
            <label>
              Комментарий {manager ? '(обязателен для доработки)' : '(необязательно)'}
              <textarea
                maxLength={2000}
                rows={3}
                value={comment}
                onChange={(event) => onCommentChange(event.target.value)}
                placeholder={
                  manager ? 'Что принято или что нужно исправить?' : 'Что сделано по задаче?'
                }
              />
            </label>
            <div className="actions">
              {availableActions(task, user).map((next) => (
                <button
                  key={next}
                  className={next === 'rework' ? 'secondary' : 'primary'}
                  disabled={busy}
                  onClick={() => {
                    void onTransition(next);
                  }}
                >
                  {actionLabels[next]}
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          </div>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <div className="history-heading">
          <h3>История изменений</h3>
          <ShieldCheck size={16} />
        </div>
        <ol className="timeline">
          {history
            .filter((item) => item.task_id === task.id)
            .map((item) => (
              <li key={item.id}>
                <span className="timeline-dot" />
                <strong>
                  {item.from_status
                    ? `${statusLabels[item.from_status]} → ${statusLabels[item.to_status]}`
                    : 'Задача создана'}
                </strong>
                <p>
                  {nameOf(item.actor_id)} · {formatDate(item.created_at)}
                </p>
              </li>
            ))}
        </ol>
        {manager && (
          <div className="detail-tools">
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                onEdit();
              }}
            >
              <Pencil size={15} />
              Редактировать
            </button>
            <button
              className="text-button danger"
              disabled={busy}
              onClick={() => {
                void onArchive();
              }}
            >
              <Trash2 size={15} />
              Удалить задачу
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
