begin;

create extension if not exists pgcrypto with schema extensions;

create type public.studio_role as enum ('owner', 'manager', 'viewer');
create type public.period_status as enum ('draft', 'calculated', 'closed');
create type public.outbox_status as enum ('pending', 'processing', 'sent', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  timezone text not null default 'UTC' check (length(timezone) between 1 and 100),
  currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create table public.studio_members (
  studio_id uuid not null references public.studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.studio_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  primary key (studio_id, user_id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  external_ref text,
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  email text,
  active boolean not null default true,
  hired_on date,
  terminated_on date,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (studio_id, id),
  unique (studio_id, external_ref),
  check (terminated_on is null or hired_on is null or terminated_on >= hired_on)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  sku text,
  name text not null check (length(trim(name)) between 1 and 160),
  category text,
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (studio_id, id),
  unique (studio_id, sku)
);

create table public.compensation_plans (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  description text,
  base_amount numeric(14,2) not null default 0 check (base_amount >= 0),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (studio_id, id),
  unique (studio_id, name)
);

create table public.bonus_tiers (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  compensation_plan_id uuid not null,
  min_amount numeric(14,2) not null check (min_amount >= 0),
  max_amount numeric(14,2),
  bonus_rate numeric(8,5) not null check (bonus_rate >= 0 and bonus_rate <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (studio_id, id),
  foreign key (studio_id, compensation_plan_id)
    references public.compensation_plans(studio_id, id) on delete cascade,
  check (max_amount is null or max_amount > min_amount),
  unique (compensation_plan_id, min_amount)
);

create table public.kpi_rules (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  compensation_plan_id uuid not null,
  metric_key text not null check (metric_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  target_value numeric(16,4) not null,
  reward_amount numeric(14,2) not null default 0 check (reward_amount >= 0),
  weight numeric(8,5) not null default 1 check (weight >= 0),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (studio_id, id),
  foreign key (studio_id, compensation_plan_id)
    references public.compensation_plans(studio_id, id) on delete cascade,
  unique (compensation_plan_id, metric_key)
);

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  starts_on date not null,
  ends_on date not null,
  status public.period_status not null default 'draft',
  calculated_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (studio_id, id),
  unique (studio_id, starts_on, ends_on),
  check (ends_on >= starts_on),
  check (
    (status = 'draft' and calculated_at is null and closed_at is null and closed_by is null)
    or (status = 'calculated' and calculated_at is not null and closed_at is null and closed_by is null)
    or (status = 'closed' and calculated_at is not null and closed_at is not null and closed_by is not null)
  )
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  period_id uuid not null,
  employee_id uuid not null,
  product_id uuid,
  external_ref text,
  occurred_at timestamptz not null,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  gross_amount numeric(14,2) not null check (gross_amount >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  foreign key (studio_id, period_id) references public.periods(studio_id, id) on delete cascade,
  foreign key (studio_id, employee_id) references public.employees(studio_id, id),
  foreign key (studio_id, product_id) references public.products(studio_id, id),
  unique (studio_id, external_ref)
);

create table public.employee_period_metrics (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  period_id uuid not null,
  employee_id uuid not null,
  compensation_plan_id uuid,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  base_amount numeric(14,2) not null default 0 check (base_amount >= 0),
  sales_bonus numeric(14,2) not null default 0 check (sales_bonus >= 0),
  kpi_bonus numeric(14,2) not null default 0 check (kpi_bonus >= 0),
  total_compensation numeric(14,2) generated always as
    (base_amount + sales_bonus + kpi_bonus) stored,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (studio_id, id),
  unique (period_id, employee_id),
  foreign key (studio_id, period_id) references public.periods(studio_id, id) on delete cascade,
  foreign key (studio_id, employee_id) references public.employees(studio_id, id),
  foreign key (studio_id, compensation_plan_id)
    references public.compensation_plans(studio_id, id)
);

create table public.calculation_snapshots (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete restrict,
  period_id uuid not null,
  employee_id uuid not null,
  source_metric_id uuid,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (studio_id, period_id) references public.periods(studio_id, id) on delete restrict,
  foreign key (studio_id, employee_id) references public.employees(studio_id, id),
  foreign key (studio_id, source_metric_id)
    references public.employee_period_metrics(studio_id, id),
  unique (period_id, employee_id)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  studio_id uuid references public.studios(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  occurred_at timestamptz not null default now(),
  request_id text
);

create table public.sync_outbox (
  id bigint generated always as identity primary key,
  studio_id uuid not null references public.studios(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status public.outbox_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  check ((status = 'sent' and processed_at is not null) or status <> 'sent')
);

create table public.studio_invites (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.studio_role not null check (role in ('manager', 'viewer')),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  check (expires_at > created_at),
  check (
    (accepted_at is null and accepted_by is null)
    or (accepted_at is not null and accepted_by is not null)
  )
);

create index studio_members_user_idx on public.studio_members(user_id, studio_id);
create index employees_studio_active_idx on public.employees(studio_id, active);
create index products_studio_active_idx on public.products(studio_id, active);
create index plans_studio_active_idx on public.compensation_plans(studio_id, active);
create index bonus_tiers_plan_range_idx on public.bonus_tiers(compensation_plan_id, min_amount);
create index kpi_rules_plan_idx on public.kpi_rules(compensation_plan_id);
create index periods_studio_status_idx on public.periods(studio_id, status, starts_on desc);
create index sales_period_employee_idx on public.sales(period_id, employee_id);
create index sales_studio_occurred_idx on public.sales(studio_id, occurred_at desc);
create index metrics_period_idx on public.employee_period_metrics(period_id);
create index snapshots_studio_period_idx on public.calculation_snapshots(studio_id, period_id);
create index audit_studio_time_idx on public.audit_log(studio_id, occurred_at desc);
create index outbox_pending_idx on public.sync_outbox(status, available_at)
  where status in ('pending', 'failed');
create index invites_lookup_idx on public.studio_invites(token_hash)
  where accepted_at is null;
create index invites_studio_expiry_idx on public.studio_invites(studio_id, expires_at);

create or replace function public.set_updated_at_and_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create or replace function public.current_studio_role(p_studio_id uuid)
returns public.studio_role
language sql
stable
security definer
set search_path = ''
as $$
  select sm.role
  from public.studio_members sm
  where sm.studio_id = p_studio_id
    and sm.user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_studio_member(p_studio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.studio_members sm
    where sm.studio_id = p_studio_id
      and sm.user_id = auth.uid()
  )
$$;

create or replace function public.can_manage_studio(p_studio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_studio_role(p_studio_id) in ('owner', 'manager'), false)
$$;

create or replace function public.is_studio_owner(p_studio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_studio_role(p_studio_id) = 'owner', false)
$$;

create or replace function public.add_studio_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.studio_members (studio_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create or replace function public.guard_closed_period_data()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_period_id uuid;
  v_new_period_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_old_period_id := old.period_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new_period_id := new.period_id;
  end if;
  if exists (
    select 1 from public.periods p
    where p.id in (v_old_period_id, v_new_period_id)
      and p.status = 'closed'
  ) then
    raise exception 'Closed period data is immutable' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.guard_closed_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'closed' then
    raise exception 'Closed period is immutable' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE'
    and old.status <> 'closed'
    and new.status = 'closed'
    and current_user not in ('postgres', 'supabase_admin')
  then
    raise exception 'Use close_period() to close a period' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.reject_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Calculation snapshots are immutable' using errcode = '55000';
end;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_studio_id uuid;
  v_record_id text;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'token_hash' else null end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'token_hash' else null end;
  v_row := coalesce(v_new, v_old);
  v_studio_id := nullif(v_row ->> 'studio_id', '')::uuid;
  if v_studio_id is null and tg_table_name = 'studios' then
    v_studio_id := nullif(v_row ->> 'id', '')::uuid;
  end if;
  if v_studio_id is not null and not exists (
    select 1 from public.studios s where s.id = v_studio_id
  ) then
    v_studio_id := null;
  end if;
  v_record_id := coalesce(v_row ->> 'id', v_row ->> 'user_id');

  insert into public.audit_log (
    studio_id, actor_id, table_name, record_id, action,
    old_data, new_data, request_id
  ) values (
    v_studio_id, auth.uid(), tg_table_name, v_record_id, tg_op,
    v_old, v_new, current_setting('request.headers', true)::jsonb ->> 'x-request-id'
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
exception
  when invalid_text_representation then
    insert into public.audit_log (
      studio_id, actor_id, table_name, record_id, action, old_data, new_data
    ) values (
      v_studio_id, auth.uid(), tg_table_name, v_record_id, tg_op, v_old, v_new
    );
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
end;
$$;

create or replace function public.enqueue_sync_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_studio_id uuid;
  v_id text;
begin
  v_studio_id := nullif(v_row ->> 'studio_id', '')::uuid;
  if v_studio_id is null and tg_table_name = 'studios' then
    v_studio_id := nullif(v_row ->> 'id', '')::uuid;
  end if;
  v_id := coalesce(v_row ->> 'id', v_row ->> 'user_id');

  if v_studio_id is not null and exists (
    select 1 from public.studios s where s.id = v_studio_id
  ) then
    insert into public.sync_outbox (
      studio_id, aggregate_type, aggregate_id, event_type, payload
    ) values (
      v_studio_id, tg_table_name, v_id, lower(tg_op),
      jsonb_build_object('record', v_row - 'token_hash', 'occurred_at', now())
    );
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.close_period(p_period_id uuid)
returns public.periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period public.periods;
begin
  select * into v_period
  from public.periods
  where id = p_period_id
  for update;

  if not found then
    raise exception 'Period not found' using errcode = 'P0002';
  end if;
  if not public.can_manage_studio(v_period.studio_id) then
    raise exception 'Insufficient permissions' using errcode = '42501';
  end if;
  if v_period.status <> 'calculated' then
    raise exception 'Only a calculated period can be closed' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.calculation_snapshots s where s.period_id = p_period_id
  ) then
    raise exception 'Snapshots already exist for this period' using errcode = '23505';
  end if;
  if not exists (
    select 1 from public.employee_period_metrics m where m.period_id = p_period_id
  ) then
    raise exception 'Cannot close a period without calculated employee metrics'
      using errcode = '23514';
  end if;

  insert into public.calculation_snapshots (
    studio_id, period_id, employee_id, source_metric_id,
    payload, payload_hash, created_by
  )
  select
    m.studio_id,
    m.period_id,
    m.employee_id,
    m.id,
    snapshot.payload,
    encode(extensions.digest(snapshot.payload::text, 'sha256'), 'hex'),
    auth.uid()
  from public.employee_period_metrics m
  cross join lateral (
    select jsonb_build_object(
      'schema_version', 1,
      'period', jsonb_build_object(
        'id', v_period.id,
        'starts_on', v_period.starts_on,
        'ends_on', v_period.ends_on
      ),
      'employee_id', m.employee_id,
      'compensation_plan', (
        select to_jsonb(cp) - 'created_at' - 'updated_at' - 'version'
        from public.compensation_plans cp
        where cp.id = m.compensation_plan_id
      ),
      'bonus_tiers', coalesce((
        select jsonb_agg(to_jsonb(bt) - 'created_at' - 'updated_at' - 'version' order by bt.min_amount)
        from public.bonus_tiers bt
        where bt.compensation_plan_id = m.compensation_plan_id
      ), '[]'::jsonb),
      'kpi_rules', coalesce((
        select jsonb_agg(to_jsonb(kr) - 'created_at' - 'updated_at' - 'version' order by kr.metric_key)
        from public.kpi_rules kr
        where kr.compensation_plan_id = m.compensation_plan_id
      ), '[]'::jsonb),
      'metrics', m.metrics,
      'result', jsonb_build_object(
        'base_amount', m.base_amount,
        'sales_bonus', m.sales_bonus,
        'kpi_bonus', m.kpi_bonus,
        'total_compensation', m.total_compensation,
        'calculated_at', m.calculated_at
      )
    ) as payload
  ) snapshot
  where m.period_id = p_period_id;

  update public.periods
  set status = 'closed', closed_at = now(), closed_by = auth.uid()
  where id = p_period_id
  returning * into v_period;

  return v_period;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns public.studio_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.studio_invites;
  v_member public.studio_members;
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'Invalid invitation token' using errcode = '22023';
  end if;

  select * into v_invite
  from public.studio_invites
  where token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if not found
    or v_invite.accepted_at is not null
    or v_invite.expires_at <= now()
    or lower(v_invite.email) <> v_email
  then
    raise exception 'Invitation is invalid or expired' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.studio_members sm
    where sm.studio_id = v_invite.studio_id and sm.user_id = auth.uid()
  ) then
    raise exception 'User is already a studio member' using errcode = '23505';
  end if;

  insert into public.studio_members (studio_id, user_id, role)
  values (v_invite.studio_id, auth.uid(), v_invite.role)
  returning * into v_member;

  update public.studio_invites
  set accepted_at = now(), accepted_by = auth.uid()
  where id = v_invite.id;

  return v_member;
end;
$$;

create trigger studios_add_owner
after insert on public.studios
for each row execute function public.add_studio_owner();

create trigger profiles_touch before update on public.profiles
for each row execute function public.set_updated_at_and_version();
create trigger studios_touch before update on public.studios
for each row execute function public.set_updated_at_and_version();
create trigger studio_members_touch before update on public.studio_members
for each row execute function public.set_updated_at_and_version();
create trigger employees_touch before update on public.employees
for each row execute function public.set_updated_at_and_version();
create trigger products_touch before update on public.products
for each row execute function public.set_updated_at_and_version();
create trigger plans_touch before update on public.compensation_plans
for each row execute function public.set_updated_at_and_version();
create trigger bonus_tiers_touch before update on public.bonus_tiers
for each row execute function public.set_updated_at_and_version();
create trigger kpi_rules_touch before update on public.kpi_rules
for each row execute function public.set_updated_at_and_version();
create trigger periods_touch before update on public.periods
for each row execute function public.set_updated_at_and_version();
create trigger sales_touch before update on public.sales
for each row execute function public.set_updated_at_and_version();
create trigger metrics_touch before update on public.employee_period_metrics
for each row execute function public.set_updated_at_and_version();
create trigger invites_touch before update on public.studio_invites
for each row execute function public.set_updated_at_and_version();

create trigger periods_closed_guard before update or delete on public.periods
for each row execute function public.guard_closed_period();
create trigger sales_closed_guard before insert or update or delete on public.sales
for each row execute function public.guard_closed_period_data();
create trigger metrics_closed_guard before insert or update or delete on public.employee_period_metrics
for each row execute function public.guard_closed_period_data();
create trigger snapshots_immutable before update or delete on public.calculation_snapshots
for each row execute function public.reject_snapshot_mutation();

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'studios', 'studio_members', 'employees', 'products',
    'compensation_plans', 'bonus_tiers', 'kpi_rules', 'periods',
    'sales', 'employee_period_metrics', 'calculation_snapshots',
    'studio_invites'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
       for each row execute function public.write_audit_log()',
      v_table || '_audit', v_table
    );
  end loop;

  foreach v_table in array array[
    'studios', 'studio_members', 'employees', 'products',
    'compensation_plans', 'bonus_tiers', 'kpi_rules', 'periods',
    'sales', 'employee_period_metrics', 'calculation_snapshots'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
       for each row execute function public.enqueue_sync_event()',
      v_table || '_outbox', v_table
    );
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.studios enable row level security;
alter table public.studio_members enable row level security;
alter table public.employees enable row level security;
alter table public.products enable row level security;
alter table public.compensation_plans enable row level security;
alter table public.bonus_tiers enable row level security;
alter table public.kpi_rules enable row level security;
alter table public.periods enable row level security;
alter table public.sales enable row level security;
alter table public.employee_period_metrics enable row level security;
alter table public.calculation_snapshots enable row level security;
alter table public.audit_log enable row level security;
alter table public.sync_outbox enable row level security;
alter table public.studio_invites enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.studio_members mine
    join public.studio_members theirs using (studio_id)
    where mine.user_id = auth.uid() and theirs.user_id = profiles.id
  )
);
create policy profiles_insert on public.profiles for insert to authenticated
with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy studios_select on public.studios for select to authenticated
using (public.is_studio_member(id));
create policy studios_insert on public.studios for insert to authenticated
with check (created_by = auth.uid());
create policy studios_update on public.studios for update to authenticated
using (public.is_studio_owner(id)) with check (public.is_studio_owner(id));
create policy studios_delete on public.studios for delete to authenticated
using (public.is_studio_owner(id));

create policy members_select on public.studio_members for select to authenticated
using (public.is_studio_member(studio_id));
create policy members_insert on public.studio_members for insert to authenticated
with check (public.is_studio_owner(studio_id));
create policy members_update on public.studio_members for update to authenticated
using (public.is_studio_owner(studio_id)) with check (public.is_studio_owner(studio_id));
create policy members_delete on public.studio_members for delete to authenticated
using (public.is_studio_owner(studio_id));

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'employees', 'products', 'compensation_plans', 'bonus_tiers',
    'kpi_rules', 'periods', 'sales', 'employee_period_metrics'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
       using (public.is_studio_member(studio_id))',
      v_table || '_select', v_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated
       with check (public.can_manage_studio(studio_id))',
      v_table || '_insert', v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated
       using (public.can_manage_studio(studio_id))
       with check (public.can_manage_studio(studio_id))',
      v_table || '_update', v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated
       using (public.can_manage_studio(studio_id))',
      v_table || '_delete', v_table
    );
  end loop;
end;
$$;

create policy snapshots_select on public.calculation_snapshots for select to authenticated
using (public.is_studio_member(studio_id));
create policy audit_select on public.audit_log for select to authenticated
using (public.is_studio_member(studio_id));
create policy outbox_select on public.sync_outbox for select to authenticated
using (public.is_studio_owner(studio_id));
create policy invites_select on public.studio_invites for select to authenticated
using (public.is_studio_owner(studio_id));
create policy invites_insert on public.studio_invites for insert to authenticated
with check (public.is_studio_owner(studio_id) and created_by = auth.uid());
create policy invites_update on public.studio_invites for update to authenticated
using (public.is_studio_owner(studio_id)) with check (public.is_studio_owner(studio_id));
create policy invites_delete on public.studio_invites for delete to authenticated
using (public.is_studio_owner(studio_id));

revoke all on function public.add_studio_owner() from public;
revoke all on function public.write_audit_log() from public;
revoke all on function public.enqueue_sync_event() from public;
revoke all on function public.close_period(uuid) from public;
revoke all on function public.accept_invite(text) from public;
grant execute on function public.close_period(uuid) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;

commit;
