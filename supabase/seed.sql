-- После миграции и ручного создания трёх подтверждённых пользователей в Auth.
-- Пароли задаются в Dashboard и в этот файл не записываются.
begin;
do $$
declare
  manager_id uuid;
  first_id uuid;
  second_id uuid;
  item record;
  executor_id uuid;
begin
  select id into manager_id from auth.users where email = 'manager@example.com';
  select id into first_id from auth.users where email = 'worker1@example.com';
  select id into second_id from auth.users where email = 'worker2@example.com';
  if manager_id is null or first_id is null or second_id is null then
    raise exception 'Сначала создайте manager@example.com, worker1@example.com и worker2@example.com в Supabase Auth';
  end if;

  insert into public.profiles(id, full_name, role) values
    (manager_id, 'Анна Миронова', 'manager'),
    (first_id, 'Илья Соколов', 'executor'),
    (second_id, 'Денис Волков', 'executor')
  on conflict (id) do nothing;

  insert into public.sites(id, name, address) values
    ('10000000-0000-4000-8000-000000000001', 'ЖК «Сосновый парк»', 'Москва, Сосновая улица, 12'),
    ('10000000-0000-4000-8000-000000000002', 'Офис на Таганской', 'Москва, Таганская улица, 24'),
    ('10000000-0000-4000-8000-000000000003', 'Дом в Лесном', 'Московская область, посёлок Лесной, 8')
  on conflict (id) do nothing;

  -- Проходим реальные переходы с разными auth.uid(), чтобы история не была поддельной.
  -- Это доверенный SQL Editor, не доступная посетителям RPC-функция.
  for item in select * from (values
    ('20000000-0000-4000-8000-000000000001', 'Проверить армирование перекрытия', 'Проверить шаг арматуры по проекту КЖ.', '10000000-0000-4000-8000-000000000001', 1, 'review'),
    ('20000000-0000-4000-8000-000000000002', 'Согласовать разводку электрики', 'Сверить расположение розеток с планом.', '10000000-0000-4000-8000-000000000001', 2, 'in_progress'),
    ('20000000-0000-4000-8000-000000000003', 'Подготовить стены под покраску', 'Проверить плоскость стен и финишный слой.', '10000000-0000-4000-8000-000000000002', 1, 'rework'),
    ('20000000-0000-4000-8000-000000000004', 'Принять поставку плитки', 'Сверить количество и маркировку с накладной.', '10000000-0000-4000-8000-000000000002', 2, 'new'),
    ('20000000-0000-4000-8000-000000000005', 'Проверить герметичность контура', 'Провести опрессовку системы отопления.', '10000000-0000-4000-8000-000000000003', 1, 'accepted'),
    ('20000000-0000-4000-8000-000000000006', 'Проверить монтаж перегородок', 'Проверить геометрию и дверные проёмы.', '10000000-0000-4000-8000-000000000003', 2, 'review')
  ) as samples(id, title, description, site_id, worker, target)
  loop
    executor_id := case when item.worker = 1 then first_id else second_id end;
    perform set_config('request.jwt.claim.sub', manager_id::text, true);
    insert into public.tasks(id, title, description, site_id, assignee_id)
      values(item.id::uuid, item.title, item.description, item.site_id::uuid, executor_id)
      on conflict (id) do nothing;
    if item.target <> 'new' and exists (
      select 1 from public.tasks where id = item.id::uuid and status = 'new'
    ) then
      perform set_config('request.jwt.claim.sub', executor_id::text, true);
      update public.tasks set status = 'in_progress' where id = item.id::uuid;
      if item.target <> 'in_progress' then
        update public.tasks set status = 'review' where id = item.id::uuid;
        if item.target in ('accepted', 'rework') then
          perform set_config('request.jwt.claim.sub', manager_id::text, true);
          update public.tasks set status = item.target::public.task_status,
            status_comment = case when item.target = 'rework'
              then 'Выровнять участок у оконного проёма и проверить повторно.' else null end
            where id = item.id::uuid;
        end if;
      end if;
    end if;
  end loop;
end;
$$;
commit;
