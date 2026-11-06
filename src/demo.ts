import type { Site, Snapshot, Status, Task } from './types';

const created = '2026-11-06T07:00:00Z';
const manager = '00000000-0000-4000-8000-000000000001';
const first = '00000000-0000-4000-8000-000000000002';
const second = '00000000-0000-4000-8000-000000000003';
const siteIds = [1, 2, 3].map((n) => `10000000-0000-4000-8000-00000000000${n}`);
const examples: [string, string, number, string, Status][] = [
  [
    'Проверить армирование перекрытия',
    'Проверить шаг арматуры по проекту КЖ. Зафиксировать результат перед заливкой.',
    0,
    first,
    'review',
  ],
  [
    'Согласовать разводку электрики',
    'Сверить расположение розеток и выключателей с актуальным планом.',
    0,
    second,
    'in_progress',
  ],
  [
    'Подготовить стены под покраску',
    'Проверить плоскость стен и нанести финишный слой шпаклёвки.',
    1,
    first,
    'rework',
  ],
  [
    'Принять поставку плитки',
    'Сверить количество и маркировку с накладной, проверить упаковку.',
    1,
    second,
    'new',
  ],
  [
    'Проверить герметичность контура',
    'Провести опрессовку системы отопления по проекту.',
    2,
    first,
    'accepted',
  ],
  [
    'Проверить монтаж перегородок',
    'Проверить геометрию, крепления и дверные проёмы.',
    2,
    second,
    'review',
  ],
];

/** Изолированные вымышленные данные макета; не имитируют защиту настоящей базы. */
export function createDemo(): Snapshot {
  const tasks = examples.map(([title, description, site, assignee, status], index) => ({
    id: `20000000-0000-4000-8000-00000000000${index + 1}`,
    title,
    description,
    site_id: siteIds[site],
    assignee_id: assignee,
    status,
    status_comment:
      status === 'rework'
        ? 'Остались неровности у оконного проёма. Выровнять и проверить повторно.'
        : null,
    created_by: manager,
    created_at: created,
  }));
  const history = tasks.flatMap((task) => {
    const path: Status[] =
      task.status === 'new'
        ? ['new']
        : task.status === 'in_progress'
          ? ['new', 'in_progress']
          : ['new', 'in_progress', 'review', ...(task.status === 'review' ? [] : [task.status])];
    return path.map((to, index) => ({
      id: `${task.id}-${index}`,
      task_id: task.id,
      actor_id: to === 'in_progress' || to === 'review' ? task.assignee_id : manager,
      from_status: index ? path[index - 1] : null,
      to_status: to,
      comment: to === 'rework' ? task.status_comment : null,
      created_at: new Date(Date.parse(created) + index * 3600000).toISOString(),
    }));
  });
  return {
    profiles: [
      { id: manager, full_name: 'Анна Миронова', role: 'manager' },
      { id: first, full_name: 'Илья Соколов', role: 'executor' },
      { id: second, full_name: 'Денис Волков', role: 'executor' },
    ],
    sites: [
      {
        id: siteIds[0],
        name: 'ЖК «Сосновый парк»',
        address: 'Москва, Сосновая улица, 12',
        created_at: created,
      },
      {
        id: siteIds[1],
        name: 'Офис на Таганской',
        address: 'Москва, Таганская улица, 24',
        created_at: created,
      },
      {
        id: siteIds[2],
        name: 'Дом в Лесном',
        address: 'Московская область, посёлок Лесной, 8',
        created_at: created,
      },
    ],
    tasks,
    history,
  };
}

/** Демо меняет только память вкладки. В подключённом режиме историю пишет база. */
export function changeDemoStatus(
  data: Snapshot,
  task: Task,
  status: Status,
  comment: string,
  actorId: string,
): Snapshot {
  return {
    ...data,
    tasks: data.tasks.map((item) =>
      item.id === task.id ? { ...item, status, status_comment: comment.trim() || null } : item,
    ),
    history: [
      ...data.history,
      {
        id: crypto.randomUUID(),
        task_id: task.id,
        actor_id: actorId,
        from_status: task.status,
        to_status: status,
        comment: comment.trim() || null,
        created_at: new Date().toISOString(),
      },
    ],
  };
}

export function saveDemoSite(
  data: Snapshot,
  values: Pick<Site, 'name' | 'address'>,
  existing?: Site,
): Snapshot {
  const site = existing
    ? { ...existing, ...values }
    : { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...values };
  return {
    ...data,
    sites: existing
      ? data.sites.map((item) => (item.id === existing.id ? site : item))
      : [...data.sites, site],
  };
}

export function saveDemoTask(
  data: Snapshot,
  values: Pick<Task, 'title' | 'description' | 'site_id' | 'assignee_id'>,
  actorId: string,
  existing?: Task,
): Snapshot {
  if (existing)
    return {
      ...data,
      tasks: data.tasks.map((item) => (item.id === existing.id ? { ...item, ...values } : item)),
    };
  const task: Task = {
    id: crypto.randomUUID(),
    ...values,
    status: 'new',
    status_comment: null,
    created_by: actorId,
    created_at: new Date().toISOString(),
  };
  return {
    ...data,
    tasks: [...data.tasks, task],
    history: [
      ...data.history,
      {
        id: crypto.randomUUID(),
        task_id: task.id,
        actor_id: actorId,
        from_status: null,
        to_status: 'new',
        comment: null,
        created_at: task.created_at,
      },
    ],
  };
}

/** Архивирование объекта убирает его задачи из списка, но не стирает историю. */
export function archiveDemoRecord(data: Snapshot, kind: 'sites' | 'tasks', id: string): Snapshot {
  const taskIds = new Set(
    data.tasks
      .filter((task) => (kind === 'tasks' ? task.id === id : task.site_id === id))
      .map((task) => task.id),
  );
  return {
    ...data,
    sites: kind === 'sites' ? data.sites.filter((site) => site.id !== id) : data.sites,
    tasks: data.tasks.filter((task) => !taskIds.has(task.id)),
  };
}
