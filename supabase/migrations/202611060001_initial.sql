-- Выполняется один раз в отдельном Supabase-проекте через SQL Editor или CLI.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create type public.app_role as enum ('manager', 'executor');
create type public.task_status as enum ('new', 'in_progress', 'review', 'accepted', 'rework');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 100),
  role public.app_role not null
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 150),
  address text not null check (char_length(btrim(address)) between 1 and 300),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  site_id uuid not null references public.sites(id) on delete restrict,
  assignee_id uuid not null references public.profiles(id) on delete restrict,
  status public.task_status not null default 'new',
  -- Комментарий текущего перехода. Копируется триггером в неизменяемую историю.
  status_comment text check (char_length(status_comment) <= 2000),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.task_status_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  from_status public.task_status,
  to_status public.task_status not null,
  comment text,
  created_at timestamptz not null default clock_timestamp()
);

create index tasks_assignee_site_idx on public.tasks(assignee_id, site_id);
create index tasks_site_idx on public.tasks(site_id);
create index tasks_creator_idx on public.tasks(created_by);
create index history_task_time_idx on public.task_status_history(task_id, created_at);
create index history_actor_idx on public.task_status_history(actor_id);

-- Роль читается из защищённой таблицы, а не из редактируемого user_metadata.
-- Helper вне exposed schemas устраняет рекурсию RLS профилей.
create function private.is_manager()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'manager'
  );
$$;
revoke all on function private.is_manager() from public, anon, authenticated;
grant execute on function private.is_manager() to authenticated;

alter table public.profiles enable row level security;
alter table public.sites enable row level security;
alter table public.tasks enable row level security;
alter table public.task_status_history enable row level security;

-- Сбрасываем стандартные grants Supabase: история и роли доступны только для чтения.
revoke all on public.profiles, public.sites, public.tasks, public.task_status_history
  from public, anon, authenticated;
grant select on public.profiles, public.task_status_history to authenticated;
grant select, insert, update on public.sites, public.tasks to authenticated;

create policy profiles_read on public.profiles for select to authenticated
using ((select private.is_manager()) or id = (select auth.uid()) or role = 'manager');

create policy tasks_read on public.tasks for select to authenticated
using ((select private.is_manager()) or (deleted_at is null and assignee_id = (select auth.uid())));
create policy tasks_create on public.tasks for insert to authenticated
with check ((select private.is_manager()));
create policy tasks_update on public.tasks for update to authenticated
using (deleted_at is null and ((select private.is_manager()) or assignee_id = (select auth.uid())))
with check ((select private.is_manager()) or assignee_id = (select auth.uid()));

create policy sites_read on public.sites for select to authenticated
using (
  (select private.is_manager()) or (deleted_at is null and exists (
    select 1 from public.tasks where site_id = sites.id and assignee_id = (select auth.uid())
  ))
);
create policy sites_create on public.sites for insert to authenticated
with check ((select private.is_manager()));
create policy sites_update on public.sites for update to authenticated
using (deleted_at is null and (select private.is_manager())) with check ((select private.is_manager()));

create policy history_read on public.task_status_history for select to authenticated
using ((select private.is_manager()) or exists (select 1 from public.tasks where id = task_id));

-- Эта проверка выполняется и для прямого PATCH через Supabase REST API.
create function private.validate_task_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  manager boolean := private.is_manager();
  executor boolean;
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select exists(select 1 from public.profiles where id = actor and role = 'executor')
    into executor;

  if tg_op = 'INSERT' then
    if not manager or new.status <> 'new' or new.created_by <> actor
       or new.status_comment is not null or new.deleted_at is not null then
      raise exception 'Only a manager can create a new task as its author' using errcode = '42501';
    end if;
    new.created_at := now();
  else
    if new.id <> old.id or new.created_by <> old.created_by or new.created_at <> old.created_at then
      raise exception 'Task identity and author are immutable' using errcode = '42501';
    end if;
    if not manager then
      if not executor or old.assignee_id <> actor or
        (to_jsonb(new) - array['status', 'status_comment']) is distinct from
        (to_jsonb(old) - array['status', 'status_comment']) then
        raise exception 'Executor may only change the status of their assigned task' using errcode = '42501';
      end if;
    end if;

    if new.status is distinct from old.status then
      if not (
        (executor and old.assignee_id = actor and (
          (old.status in ('new', 'rework') and new.status = 'in_progress') or
          (old.status = 'in_progress' and new.status = 'review')
        )) or
        (manager and old.status = 'review' and new.status in ('accepted', 'rework'))
      ) then
        raise exception 'Forbidden status transition' using errcode = '23514';
      end if;
      new.status_comment := nullif(btrim(new.status_comment), '');
      if new.status = 'rework' and new.status_comment is null then
        raise exception 'Rework requires a comment' using errcode = '23514';
      end if;
    elsif new.status_comment is distinct from old.status_comment then
      raise exception 'A comment cannot be changed without a status transition' using errcode = '23514';
    end if;
  end if;

  if not exists(select 1 from public.profiles where id = new.assignee_id and role = 'executor') then
    raise exception 'Assignee must be an executor' using errcode = '23514';
  end if;
  -- Архивирование объекта вызывает архивирование задач в той же транзакции.
  if new.deleted_at is null and not exists (
    select 1 from public.sites where id = new.site_id and deleted_at is null
  ) then
    raise exception 'Task requires an active site' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Клиент не имеет INSERT в историю. Автор и время определяются только базой.
create function private.record_task_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_status_history(task_id, actor_id, from_status, to_status, comment)
      values(new.id, auth.uid(), null, new.status, null);
  elsif new.status is distinct from old.status then
    insert into public.task_status_history(task_id, actor_id, from_status, to_status, comment)
      values(new.id, auth.uid(), old.status, new.status, new.status_comment);
  end if;
  return new;
end;
$$;

revoke all on function private.validate_task_write(), private.record_task_status()
  from public, anon, authenticated;
create trigger validate_task before insert or update on public.tasks
  for each row execute function private.validate_task_write();
create trigger record_task_status after insert or update on public.tasks
  for each row execute function private.record_task_status();

-- Удаление в интерфейсе логическое: история не уничтожается даже постановщиком.
create function private.archive_site_tasks()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.tasks set deleted_at = new.deleted_at
      where site_id = old.id and deleted_at is null;
  end if;
  return new;
end;
$$;
revoke all on function private.archive_site_tasks() from public, anon, authenticated;
create trigger archive_site_tasks before update on public.sites
  for each row execute function private.archive_site_tasks();

commit;
