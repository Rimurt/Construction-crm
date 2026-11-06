-- Только отдельная тестовая БД после миграции и seed. Изменения откатываются.
-- Проверяем права роли authenticated, а не всесильного владельца postgres.
begin;
do $$
declare
  manager_id uuid;
  first_id uuid;
  second_id uuid;
  touched integer;
  history_count integer;
begin
  select id into manager_id from auth.users where email = 'manager@example.com';
  select id into first_id from auth.users where email = 'worker1@example.com';
  select id into second_id from auth.users where email = 'worker2@example.com';
  assert manager_id is not null and first_id is not null and second_id is not null;

  perform set_config('request.jwt.claim.sub', manager_id::text, true);
  set local role authenticated;
  assert (select count(*) = 6 from public.tasks), 'Manager must see all tasks';
  insert into public.sites(id, name, address) values
    ('10000000-0000-4000-8000-000000000004', 'Только второй исполнитель', 'Тестовый адрес');
  insert into public.tasks(id, title, site_id, assignee_id) values
    ('20000000-0000-4000-8000-000000000007', 'Чужая задача', '10000000-0000-4000-8000-000000000004', second_id);

  perform set_config('request.jwt.claim.sub', first_id::text, true);
  assert (select count(*) = 3 from public.tasks), 'Executor must see only assigned tasks';
  assert (select count(*) = 3 from public.sites), 'Unassigned site must be hidden';
  assert not exists(select 1 from public.tasks where assignee_id = second_id), 'Foreign task leaked';
  update public.tasks set title = 'Взлом' where id = '20000000-0000-4000-8000-000000000007';
  get diagnostics touched = row_count;
  assert touched = 0, 'Foreign task was changed';
  begin
    delete from public.tasks where assignee_id = first_id;
    raise exception 'Executor physically deleted a task';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.profiles set role = 'manager' where id = first_id;
    raise exception 'Role escalation was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.tasks set title = 'Изменить описание' where id = '20000000-0000-4000-8000-000000000003';
    raise exception 'Executor changed task metadata';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.tasks set assignee_id = second_id where id = '20000000-0000-4000-8000-000000000003';
    raise exception 'Executor reassigned task';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.tasks set status = 'accepted' where id = '20000000-0000-4000-8000-000000000003';
    raise exception 'Illegal executor transition was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.tasks(title, site_id, assignee_id)
      values('Недопустимая задача', '10000000-0000-4000-8000-000000000001', first_id);
    raise exception 'Executor created a task';
  exception when insufficient_privilege then null;
  end;

  select count(*) into history_count from public.task_status_history
    where task_id = '20000000-0000-4000-8000-000000000003';
  update public.tasks set status = 'in_progress', status_comment = null
    where id = '20000000-0000-4000-8000-000000000003';
  update public.tasks set status = 'review', status_comment = 'Исправлено'
    where id = '20000000-0000-4000-8000-000000000003';
  assert (select count(*) = history_count + 2 from public.task_status_history
    where task_id = '20000000-0000-4000-8000-000000000003'), 'Missing automatic history';
  assert (select actor_id = first_id and comment = 'Исправлено' from public.task_status_history
    where task_id = '20000000-0000-4000-8000-000000000003' order by created_at desc limit 1), 'Wrong audit actor';
  assert not exists(select 1 from public.task_status_history
    where task_id = '20000000-0000-4000-8000-000000000007'), 'Foreign history leaked';

  begin
    insert into public.task_status_history(task_id, actor_id, to_status)
      values('20000000-0000-4000-8000-000000000003', manager_id, 'accepted');
    raise exception 'History forgery accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.task_status_history set comment = 'Взлом';
    raise exception 'History update accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.task_status_history;
    raise exception 'History delete accepted';
  exception when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', manager_id::text, true);
  begin
    update public.tasks set status = 'rework', status_comment = '   '
      where id = '20000000-0000-4000-8000-000000000003';
    raise exception 'Empty rework comment accepted';
  exception when check_violation then null;
  end;
  update public.tasks set status = 'rework', status_comment = 'Нужно исправить угол'
    where id = '20000000-0000-4000-8000-000000000003';
  begin
    update public.tasks set status = 'in_progress'
      where id = '20000000-0000-4000-8000-000000000003';
    raise exception 'Manager took executor action';
  exception when check_violation then null;
  end;
  begin
    update public.tasks set created_by = second_id
      where id = '20000000-0000-4000-8000-000000000003';
    raise exception 'Author spoofing accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tasks(title, site_id, assignee_id)
      values('Не исполнитель', '10000000-0000-4000-8000-000000000001', manager_id);
    raise exception 'Manager assigned as executor';
  exception when check_violation then null;
  end;
  begin
    delete from public.task_status_history;
    raise exception 'Manager deleted history';
  exception when insufficient_privilege then null;
  end;

  update public.tasks set status = 'accepted', status_comment = null
    where id = '20000000-0000-4000-8000-000000000001';
  update public.sites set deleted_at = now() where id = '10000000-0000-4000-8000-000000000004';
  assert exists(select 1 from public.tasks where id = '20000000-0000-4000-8000-000000000007' and deleted_at is not null), 'Object archive failed';
  assert exists(select 1 from public.task_status_history where task_id = '20000000-0000-4000-8000-000000000007'), 'Archive destroyed history';
  begin
    delete from public.tasks where id = '20000000-0000-4000-8000-000000000007';
    raise exception 'Manager physically deleted a task';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', second_id::text, true);
  assert not exists(select 1 from public.tasks where id = '20000000-0000-4000-8000-000000000007'), 'Archived task visible to executor';
  assert not exists(select 1 from public.sites where id = '10000000-0000-4000-8000-000000000004'), 'Archived site visible to executor';

  set local role anon;
  begin
    perform count(*) from public.tasks;
    raise exception 'Anonymous read accepted';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS: isolation, roles, transitions, comments, audit and archive';
end;
$$;
rollback;
