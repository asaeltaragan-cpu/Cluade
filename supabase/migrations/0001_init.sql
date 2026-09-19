-- Sweet Automation — core schema, roles, RLS.
-- Ported from the verified reference implementation.

-- ROLES
create type public.app_role as enum ('admin','manager','agent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  agent_name text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_manager(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','manager'))
$$;

create or replace function public.current_agent_name()
returns text language sql stable security definer set search_path = public as $$
  select agent_name from public.profiles where id = auth.uid()
$$;

create policy "profiles_select_self_or_manager" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_manager(auth.uid()));
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles_admin_all" on public.profiles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create policy "user_roles_select" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_manager(auth.uid()));
create policy "user_roles_admin_all" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- new user bootstrap: first user becomes admin
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  select not exists (select 1 from public.user_roles) into first_user;
  if first_user then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end; $$;

create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

-- IMPORTS
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_name text,
  row_count integer not null default 0,
  latest_month text,
  agents_count integer not null default 0,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.imports to authenticated;
grant all on public.imports to service_role;
alter table public.imports enable row level security;
create policy "imports_select_auth" on public.imports for select to authenticated using (true);
create policy "imports_manager_write" on public.imports for all to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));

-- SALES FACTS
create table public.sales_facts (
  id bigserial primary key,
  import_id uuid not null references public.imports(id) on delete cascade,
  product text not null,
  entity_id text not null,
  customer text,
  channel text,
  agent text not null,
  ym text not null,
  qty numeric not null default 0
);
create index sales_facts_import_agent_idx on public.sales_facts (import_id, agent);
create index sales_facts_import_ym_idx on public.sales_facts (import_id, ym);
create index sales_facts_entity_idx on public.sales_facts (import_id, agent, entity_id, product);
grant select, insert, update, delete on public.sales_facts to authenticated;
grant all on public.sales_facts to service_role;
grant usage, select on sequence public.sales_facts_id_seq to authenticated, service_role;
alter table public.sales_facts enable row level security;
create policy "sales_select_scoped" on public.sales_facts for select to authenticated
  using (public.is_manager(auth.uid()) or agent = public.current_agent_name());
create policy "sales_manager_write" on public.sales_facts for all to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));

-- TARGETS
create table public.targets (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  product text not null default 'ALL',
  year integer not null,
  recommended_qty numeric,
  target_qty numeric not null default 0,
  note text,
  set_by uuid references auth.users(id) on delete set null,
  set_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent, product, year)
);
grant select, insert, update, delete on public.targets to authenticated;
grant all on public.targets to service_role;
alter table public.targets enable row level security;
create policy "targets_select_scoped" on public.targets for select to authenticated
  using (public.is_manager(auth.uid()) or agent = public.current_agent_name());
create policy "targets_manager_write" on public.targets for all to authenticated
  using (public.is_manager(auth.uid())) with check (public.is_manager(auth.uid()));

create table public.target_history (
  id uuid primary key default gen_random_uuid(),
  target_id uuid references public.targets(id) on delete cascade,
  agent text not null,
  product text not null,
  year integer not null,
  old_qty numeric,
  new_qty numeric,
  reason text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.target_history to authenticated;
grant all on public.target_history to service_role;
alter table public.target_history enable row level security;
create policy "target_history_select_scoped" on public.target_history for select to authenticated
  using (public.is_manager(auth.uid()) or agent = public.current_agent_name());
create policy "target_history_manager_write" on public.target_history for insert to authenticated
  with check (public.is_manager(auth.uid()));

-- WORK ITEMS (survive refreshes)
create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  entity_id text not null,
  product text not null,
  customer text,
  status text not null default 'טרם טופל',
  agent_note text,
  manager_note text,
  task text,
  owner text,
  next_follow_up date,
  handled_at date,
  missing_in_latest boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (agent, entity_id, product)
);
create index work_items_next_follow_up_idx on public.work_items (next_follow_up);
grant select, insert, update, delete on public.work_items to authenticated;
grant all on public.work_items to service_role;
alter table public.work_items enable row level security;
create policy "work_items_select_scoped" on public.work_items for select to authenticated
  using (public.is_manager(auth.uid()) or agent = public.current_agent_name());
create policy "work_items_agent_write" on public.work_items for all to authenticated
  using (public.is_manager(auth.uid()) or agent = public.current_agent_name())
  with check (public.is_manager(auth.uid()) or agent = public.current_agent_name());

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger touch_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger touch_targets before update on public.targets for each row execute function public.touch_updated_at();
create trigger touch_work_items before update on public.work_items for each row execute function public.touch_updated_at();

-- WORK ITEM HISTORY (audit trail)
create table public.work_item_history (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid references public.work_items(id) on delete cascade,
  agent text not null,
  entity_id text not null,
  product text not null,
  customer text,
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references auth.users(id),
  changed_by_name text,
  created_at timestamptz not null default now()
);
grant select on public.work_item_history to authenticated;
grant all on public.work_item_history to service_role;
alter table public.work_item_history enable row level security;
create policy work_item_history_select_scoped on public.work_item_history
  for select to authenticated
  using (is_manager(auth.uid()) or (agent = current_agent_name()));
create index work_item_history_created_idx on public.work_item_history (created_at desc);
create index work_item_history_agent_idx on public.work_item_history (agent);

create or replace function public.log_work_item_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  f text;
  old_v text;
  new_v text;
begin
  foreach f in array array['status','task','owner','next_follow_up','agent_note','manager_note','handled_at'] loop
    if TG_OP = 'INSERT' then
      old_v := null;
    else
      execute format('select ($1).%I::text', f) into old_v using OLD;
    end if;
    execute format('select ($1).%I::text', f) into new_v using NEW;
    if new_v is distinct from old_v then
      insert into public.work_item_history
        (work_item_id, agent, entity_id, product, customer, field, old_value, new_value, changed_by, changed_by_name)
      values
        (NEW.id, NEW.agent, NEW.entity_id, NEW.product, NEW.customer, f, old_v, new_v, NEW.updated_by, NEW.updated_by_name);
    end if;
  end loop;
  return NEW;
end;
$$;

revoke all on function public.log_work_item_change() from public, anon, authenticated;

create trigger work_items_log_changes
after insert or update on public.work_items
for each row execute function public.log_work_item_change();

-- Flags work items not present in the given import, without deleting them.
create or replace function public.sync_work_item_flags(_import_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_manager(auth.uid()) then
    raise exception 'not allowed';
  end if;

  update public.work_items w
  set missing_in_latest = not exists (
    select 1 from public.sales_facts f
    where f.import_id = _import_id
      and f.agent = w.agent
      and f.entity_id = w.entity_id
      and f.product = w.product
  )
  where true;
end;
$$;

grant execute on function public.sync_work_item_flags(uuid) to authenticated;
