import { Check, ChevronRight, Clock3, ListTodo, MapPin } from 'lucide-react';
import { statusLabels, type History, type Profile, type Task } from './types';
import { lastStatusUpdate } from './presentation';

type Props = {
  user: Profile;
  tasks: Task[];
  history: History[];
  nameOf: (id: string) => string;
  siteName: (id: string) => string;
  onOpen: (task: Task) => void;
};

export default function TaskBoard({ user, tasks, history, nameOf, siteName, onOpen }: Props) {
  const review = tasks.filter((task) => task.status === 'review');
  const executing = tasks.filter((task) => ['new', 'in_progress', 'rework'].includes(task.status));
  const accepted = tasks.filter((task) => task.status === 'accepted');

  function rows(items: Task[]) {
    return (
      <ul className="task-rows">
        {items.map((task) => {
          const updated = lastStatusUpdate(task, history);
          return (
            <li key={task.id}>
              <button
                className="task-row"
                aria-label={`Открыть: ${task.title}`}
                onClick={() => onOpen(task)}
              >
                <span className="task-row-heading">
                  <span className={`task-symbol ${task.status === 'accepted' ? 'done' : ''}`}>
                    {task.status === 'accepted' ? <Check size={16} /> : <ListTodo size={16} />}
                  </span>
                  <strong>{task.title}</strong>
                  <ChevronRight size={17} />
                </span>
                <span className="task-row-site">
                  <MapPin size={13} />
                  {siteName(task.site_id)}
                </span>
                <span className="task-row-meta">
                  <span className="task-row-person">{nameOf(task.assignee_id)}</span>
                  <span className={`badge ${task.status}`}>
                    <i />
                    {statusLabels[task.status]}
                  </span>
                </span>
                <span className="task-row-updated">
                  <Clock3 size={13} />
                  <span>
                    Статус обновлён:{' '}
                    <time dateTime={updated} title={new Date(updated).toLocaleString('ru-RU')}>
                      {new Date(updated).toLocaleString('ru-RU', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </time>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  // Исполнителю нужен личный список во всех статусах, без очередей постановщика.
  if (user.role === 'executor') {
    const ownTasks = tasks.filter((task) => task.assignee_id === user.id);
    return (
      <div className="task-board">
        <section className="task-column execution-column" aria-label="Мои задачи">
          <header className="task-column-heading">
            <span>
              <ListTodo size={18} />
              <strong>Назначено вам</strong>
            </span>
            <span className="task-column-count">{ownTasks.length}</span>
          </header>
          <p className="task-column-description">
            Ваши задачи во всех статусах. Откройте задачу, чтобы увидеть доступные действия.
          </p>
          {ownTasks.length ? (
            rows(ownTasks)
          ) : (
            <p className="task-column-empty">Назначенных вам задач с выбранными условиями нет.</p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="task-board">
      <div className="task-columns">
        <section className="task-column review-column" aria-label="Требуют действий постановщика">
          <header className="task-column-heading">
            <span>
              <ListTodo size={18} />
              <strong>Требуют действий постановщика</strong>
            </span>
            <span className="task-column-count">{review.length}</span>
          </header>
          <p className="task-column-description">Проверить результат и принять решение</p>
          {review.length ? (
            rows(review)
          ) : (
            <p className="task-column-empty">Нет задач на проверке</p>
          )}
        </section>
        <section className="task-column execution-column" aria-label="У исполнителей">
          <header className="task-column-heading">
            <span>
              <Clock3 size={18} />
              <strong>У исполнителей</strong>
            </span>
            <span className="task-column-count">{executing.length}</span>
          </header>
          <p className="task-column-description">Взять в работу, выполнить или доработать</p>
          {executing.length ? (
            rows(executing)
          ) : (
            <p className="task-column-empty">Нет задач у исполнителей</p>
          )}
        </section>
      </div>
      {accepted.length > 0 && (
        <details className="accepted-tasks" open={accepted.length === tasks.length || undefined}>
          <summary>
            <Check size={17} />
            <strong>Принятые задачи</strong>
            <span className="task-column-count">{accepted.length}</span>
            <ChevronRight size={16} />
          </summary>
          {rows(accepted)}
        </details>
      )}
      {!tasks.length && (
        <p className="task-board-empty">
          Подходящих задач пока нет. Попробуйте изменить поиск или фильтр.
        </p>
      )}
    </div>
  );
}
