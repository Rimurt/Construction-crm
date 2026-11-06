import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Check,
  ChevronRight,
  Clock3,
  FolderOpen,
  LayoutGrid,
  ListTodo,
  LogOut,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {
  archiveDemoRecord,
  changeDemoStatus,
  createDemo,
  saveDemoSite,
  saveDemoTask,
} from './demo';
import TaskBoard from './TaskBoard';
import EditorDialog, { type Editor } from './components/EditorDialog';
import TaskDetails from './components/TaskDetails';
import LoginPage from './components/LoginPage';
import { initials } from './presentation';
import { changeStatus, loadSnapshot, supabase } from './supabase';
import { availableActions, statusLabels, type Snapshot, type Status, type Task } from './types';

const empty: Snapshot = { profiles: [], sites: [], tasks: [], history: [] };
export default function App() {
  const [data, setData] = useState<Snapshot>(() => (supabase ? empty : createDemo()));
  const [userId, setUserId] = useState<string | null>(() =>
    supabase ? null : createDemo().profiles[0].id,
  );
  const [authReady, setAuthReady] = useState(!supabase);
  const [view, setView] = useState<'sites' | 'tasks'>('sites');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [comment, setComment] = useState('');
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const user = data.profiles.find((profile) => profile.id === userId);
  const manager = user?.role === 'manager';

  // SDK восстанавливает сессию и сообщает о входе, выходе и обновлении токена.
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data: result, error: failure }) => {
      if (active) {
        setUserId(result.session?.user.id ?? null);
        setAuthReady(true);
        if (failure) setError(failure.message);
      }
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !userId) return;
    setData(empty);
    setTaskId(null);
    setEditor(null);
    setSiteId(null);
    setQuery('');
    setStatus('all');
    let active = true;
    loadSnapshot()
      .then((result) => {
        if (active) {
          setData(result);
          setView(
            result.profiles.find((profile) => profile.id === userId)?.role === 'executor'
              ? 'tasks'
              : 'sites',
          );
          if (!result.profiles.some((profile) => profile.id === userId))
            setError('Для аккаунта не создан профиль. Обратитесь к администратору проекта.');
        }
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  // Это фильтр представления. Настоящий доступ к данным независимо ограничен RLS.
  const visibleTasks = data.tasks.filter((task) => manager || task.assignee_id === userId);
  const sites = data.sites.filter(
    (site) => manager || visibleTasks.some((task) => task.site_id === site.id),
  );
  const site = sites.find((item) => item.id === siteId);
  const selected = visibleTasks.find((task) => task.id === taskId);
  const nameOf = (id: string) =>
    data.profiles.find((profile) => profile.id === id)?.full_name ?? 'Пользователь';
  const siteName = (id: string) => sites.find((item) => item.id === id)?.name ?? 'Объект';
  const tasks = visibleTasks.filter(
    (task) =>
      (!site || task.site_id === site.id) &&
      (status === 'all' || task.status === status) &&
      `${task.title} ${siteName(task.site_id)}`.toLowerCase().includes(query.toLowerCase()),
  );

  /** Общая обработка ожидания и ошибки для кнопок, сохраняющих данные. */
  async function run(action: () => Promise<void>) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : ((failure as { message?: string }).message ?? 'Операция не выполнена'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (supabase) setData(await loadSnapshot());
  }

  async function transition(task: Task, next: Status) {
    if (!user || !availableActions(task, user).includes(next))
      throw new Error('Это действие недоступно.');
    if (next === 'rework' && !comment.trim()) throw new Error('Напишите, что нужно исправить.');
    if (supabase) {
      await changeStatus(task, next, comment);
      await refresh();
    } else {
      setData((previous) => changeDemoStatus(previous, task, next, comment, user.id));
    }
    setComment('');
    setNotice(`Статус изменён: ${statusLabels[next].toLowerCase()}.`);
  }

  /** Поля формы одинаковы для демо и Supabase; сервер отдельно проверяет права записи. */
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !manager || !user) return;
    const fields = new FormData(event.currentTarget);
    const text = (key: string) => String(fields.get(key) ?? '').trim();
    await run(async () => {
      if (editor.kind === 'site') {
        const values = { name: text('name'), address: text('address') };
        if (!values.name || !values.address) throw new Error('Заполните название и адрес.');
        if (!addressConfirmed)
          throw new Error('Выберите московский адрес с номером дома из подсказок.');
        if (supabase) {
          const result = editor.value
            ? await supabase
                .from('sites')
                .update(values)
                .eq('id', editor.value.id)
                .select('id')
                .single()
            : await supabase.from('sites').insert(values).select('id').single();
          if (result.error) throw result.error;
          await refresh();
        } else {
          setData((previous) => saveDemoSite(previous, values, editor.value));
        }
      } else {
        const values = {
          title: text('title'),
          description: text('description'),
          site_id: text('site_id'),
          assignee_id: text('assignee_id'),
        };
        if (!values.title) throw new Error('Заполните название задачи.');
        if (supabase) {
          const result = editor.value
            ? await supabase
                .from('tasks')
                .update(values)
                .eq('id', editor.value.id)
                .select('id')
                .single()
            : await supabase.from('tasks').insert(values).select('id').single();
          if (result.error) throw result.error;
          await refresh();
        } else {
          setData((previous) => saveDemoTask(previous, values, user.id, editor.value));
        }
      }
      setEditor(null);
      setNotice('Изменения сохранены.');
    });
  }

  /** Удаление в интерфейсе означает архивирование; записи истории сохраняются. */
  async function remove(kind: 'sites' | 'tasks', id: string) {
    if (
      !manager ||
      !window.confirm(
        kind === 'sites'
          ? 'Убрать объект и его задачи в архив? История сохранится.'
          : 'Убрать задачу в архив? История сохранится.',
      )
    )
      return;
    await run(async () => {
      if (supabase) {
        const { error: failure } = await supabase
          .from(kind)
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id)
          .select('id')
          .single();
        if (failure) throw failure;
        await refresh();
      } else {
        setData((previous) => archiveDemoRecord(previous, kind, id));
      }
      setTaskId(null);
      if (kind === 'sites') setSiteId(null);
      setNotice('Убрано в архив. История сохранена.');
    });
  }

  if (!authReady)
    return (
      <main className="login-page">
        <p>Восстанавливаем сессию…</p>
      </main>
    );
  if (supabase && !userId)
    return (
      <LoginPage
        busy={busy}
        error={error}
        onLogin={(email, password) =>
          run(async () => {
            const { error: failure } = await supabase!.auth.signInWithPassword({ email, password });
            if (failure) throw failure;
          })
        }
      />
    );

  if (!user)
    return (
      <main className="login-page">
        <div className="login-card">
          <h1>Подготовка пространства</h1>
          <p>{error || 'Загружаем профиль и доступные объекты…'}</p>
          <button
            className="secondary"
            onClick={() => {
              void run(refresh);
            }}
          >
            Повторить
          </button>
          <button
            className="text-button"
            onClick={() => {
              void run(async () => {
                await supabase?.auth.signOut();
                setData(empty);
              });
            }}
          >
            Выйти
          </button>
        </div>
      </main>
    );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          href="#"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            setView('sites');
            setSiteId(null);
          }}
        >
          <span className="brand-mark">
            <Building2 size={25} />
          </span>
          <span>
            контур<span className="brand-caption">ОБЪЕКТЫ И ЗАДАЧИ</span>
          </span>
        </a>
        <div className="workspace-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Разделы">
          <button
            className={view === 'sites' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setView('sites');
              setSiteId(null);
              setQuery('');
              setStatus('all');
            }}
          >
            <LayoutGrid size={19} /> Объекты <span>{sites.length}</span>
          </button>
          <button
            className={view === 'tasks' ? 'nav-item active' : 'nav-item'}
            onClick={() => {
              setView('tasks');
              setSiteId(null);
              setQuery('');
              setStatus('all');
            }}
          >
            <ListTodo size={19} />
            {manager ? 'Все задачи' : 'Мои задачи'}
            <span>{visibleTasks.length}</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" />
          <strong>Всё в одном контуре</strong>
          <p>
            От первой задачи
            <br />
            до принятой работы.
          </p>
          <div className="line-buildings">
            <i />
            <i />
            <i />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            Рабочее пространство <ChevronRight size={14} />
            <strong>
              {site
                ? site.name
                : view === 'sites'
                  ? 'Объекты'
                  : manager
                    ? 'Все задачи'
                    : 'Мои задачи'}
            </strong>
          </div>
          <div className="user-block">
            <span className="avatar">{initials(user.full_name)}</span>
            <div>
              <strong>{user.full_name}</strong>
              <small>{manager ? 'Постановщик' : 'Исполнитель'}</small>
            </div>
            {supabase && (
              <button
                className="icon-button"
                aria-label="Выйти"
                onClick={() => {
                  void run(async () => {
                    await supabase!.auth.signOut();
                    setData(empty);
                    setSiteId(null);
                    setTaskId(null);
                  });
                }}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </header>
        {!supabase && (
          <div className="prototype-bar">
            <span>
              <span className="live-dot" />
              Локальный макет · вымышленные данные
            </span>
            <label>
              Посмотреть как
              <select
                aria-label="Режим просмотра"
                value={user.id}
                onChange={(event) => {
                  setUserId(event.target.value);
                  setSiteId(null);
                  setTaskId(null);
                  setEditor(null);
                  setError('');
                  setNotice('');
                  setView('tasks');
                }}
              >
                {data.profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.full_name} ·{' '}
                    {profile.role === 'manager' ? 'постановщик' : 'исполнитель'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">КОМАНДА. ОБЪЕКТЫ. РЕЗУЛЬТАТ.</div>
              {site && (
                <button className="back-button" onClick={() => setSiteId(null)}>
                  <ArrowLeft size={14} />
                  Все объекты
                </button>
              )}
              <h1>
                {site
                  ? site.name
                  : view === 'sites'
                    ? 'Объекты под контролем'
                    : manager
                      ? 'Задачи команды'
                      : 'Мои задачи'}
              </h1>
              <p>
                {site
                  ? site.address
                  : view === 'sites'
                    ? 'Единая картина работ: от постановки задачи до приёмки.'
                    : manager
                      ? 'Назначайте, проверяйте и принимайте результат.'
                      : 'Ваши работы, доступные действия и обратная связь.'}
              </p>
            </div>
            {manager && (
              <button
                className="primary"
                disabled={busy}
                onClick={() => setEditor({ kind: view === 'sites' && !site ? 'site' : 'task' })}
              >
                <Plus size={18} />
                {view === 'sites' && !site ? 'Новый объект' : 'Новая задача'}
              </button>
            )}
          </div>
          <div className="stats">
            {[
              {
                label: 'Объектов',
                value: sites.length,
                Icon: Building2,
                detail: 'в рабочем пространстве',
                tone: 'green',
              },
              {
                label: 'В работе',
                value: visibleTasks.filter((task) => task.status === 'in_progress').length,
                Icon: Clock3,
                detail: 'двигаются к результату',
                tone: 'blue',
              },
              {
                label: 'На проверке',
                value: visibleTasks.filter((task) => task.status === 'review').length,
                Icon: ListTodo,
                detail: 'ждут решения постановщика',
                tone: 'orange',
              },
              {
                label: 'Принято',
                value: visibleTasks.filter((task) => task.status === 'accepted').length,
                Icon: Check,
                detail: 'работ завершено',
                tone: 'green',
              },
            ].map(({ label, value, Icon, detail, tone }) => (
              <div className="stat" key={label}>
                <div>
                  <span>{label}</span>
                  <span className={`stat-icon ${tone}`}>
                    <Icon size={18} />
                  </span>
                </div>
                <strong>{value.toString().padStart(2, '0')}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          {view === 'sites' && !site && (
            <section className="sites-section">
              <div className="section-heading">
                <h2>
                  Ваши объекты <span>{sites.length}</span>
                </h2>
                <span className="muted">Каждая деталь на своём месте</span>
              </div>
              <div className="sites-grid">
                {sites.map((item, index) => {
                  const projectTasks = visibleTasks.filter((task) => task.site_id === item.id);
                  const accepted = projectTasks.filter((task) => task.status === 'accepted').length;
                  return (
                    <button
                      className="site-card"
                      key={item.id}
                      onClick={() => {
                        setSiteId(item.id);
                        setQuery('');
                        setStatus('all');
                      }}
                    >
                      <div className={`site-art art-${index % 3}`}>
                        <div className="plan-grid" />
                        <Building2 size={82} strokeWidth={0.7} />
                        <span>ОБЪЕКТ / {String(index + 1).padStart(2, '0')}</span>
                        <span className="art-arrow">
                          <ArrowUpRight size={18} />
                        </span>
                      </div>
                      <div className="site-card-body">
                        <h3>{item.name}</h3>
                        <p>
                          <MapPin size={14} />
                          {item.address}
                        </p>
                        <div className="progress-track">
                          <i
                            style={{
                              width: `${projectTasks.length ? (accepted / projectTasks.length) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <div className="site-card-bottom">
                          <span>{projectTasks.length} задач</span>
                          <span>
                            {accepted} принято <ChevronRight size={14} />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {!sites.length && (
                <div className="empty">
                  <FolderOpen />
                  Нет доступных объектов.
                </div>
              )}
            </section>
          )}
          {site && manager && (
            <div className="project-tools">
              <button
                className="text-button"
                onClick={() => setEditor({ kind: 'site', value: site })}
              >
                <Pencil size={15} />
                Изменить объект
              </button>
              <button
                className="text-button danger"
                onClick={() => {
                  void remove('sites', site.id);
                }}
                disabled={busy}
              >
                <Trash2 size={15} />
                Удалить объект
              </button>
            </div>
          )}
          <section className="tasks-section">
            <div className="section-heading">
              <h2>
                {!manager
                  ? site
                    ? 'Мои задачи на объекте'
                    : 'Мои задачи'
                  : site
                    ? 'Задачи объекта'
                    : view === 'sites'
                      ? 'В фокусе команды'
                      : 'Список задач'}{' '}
                <span>{tasks.length}</span>
              </h2>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    await refresh();
                    setNotice('Список актуален.');
                  });
                }}
              >
                Обновить
              </button>
            </div>
            <div className="table-toolbar">
              <label className="search">
                <Search size={17} />
                <input
                  aria-label="Поиск задач"
                  placeholder="Найти задачу или объект…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label className="status-filter">
                Статус
                <select
                  aria-label="Фильтр статуса"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">Все статусы</option>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <TaskBoard
              user={user}
              tasks={tasks}
              history={data.history}
              nameOf={nameOf}
              siteName={siteName}
              onOpen={(task) => {
                setTaskId(task.id);
                setComment('');
                setError('');
                setNotice('');
              }}
            />
            <div className="table-footer">
              <span>Показано задач: {tasks.length}</span>
              <span>
                <span className="live-dot" />
                {supabase ? 'Данные из Supabase' : 'Можно менять роли и статусы'}
              </span>
            </div>
          </section>
          <footer className="page-footer">
            КОНТУР <span>Ясность в задачах. Порядок на объектах.</span>
            <span>Рабочее пространство / 2026</span>
          </footer>
        </main>
      </div>
      {selected && (
        <TaskDetails
          task={selected}
          user={user}
          history={data.history}
          nameOf={nameOf}
          siteName={siteName}
          comment={comment}
          busy={busy}
          error={error}
          notice={notice}
          onCommentChange={setComment}
          onTransition={(next) => run(() => transition(selected, next))}
          onEdit={() => {
            setTaskId(null);
            setEditor({ kind: 'task', value: selected });
          }}
          onArchive={() => remove('tasks', selected.id)}
          onClose={() => {
            setTaskId(null);
            setError('');
          }}
        />
      )}
      {editor && (
        <EditorDialog
          editor={editor}
          siteId={siteId}
          sites={sites}
          profiles={data.profiles}
          busy={busy}
          error={error}
          onSave={save}
          onAddressValidityChange={setAddressConfirmed}
          onClose={() => {
            setEditor(null);
            setError('');
          }}
        />
      )}
    </div>
  );
}
