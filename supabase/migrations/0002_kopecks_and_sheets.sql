begin;

alter table public.studios
  alter column currency_code set default 'RUB';

alter table public.products
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.products
  add constraint products_metadata_object
  check (jsonb_typeof(metadata) = 'object');

alter table public.products
  alter column unit_price type bigint
  using round(unit_price * 100)::bigint;

alter table public.compensation_plans
  alter column base_amount type bigint
  using round(base_amount * 100)::bigint;

alter table public.bonus_tiers
  alter column min_amount type bigint
  using round(min_amount * 100)::bigint;

alter table public.bonus_tiers
  alter column max_amount type bigint
  using case
    when max_amount is null then null
    else round(max_amount * 100)::bigint
  end;

alter table public.kpi_rules
  alter column reward_amount type bigint
  using round(reward_amount * 100)::bigint;

alter table public.sales
  alter column gross_amount type bigint
  using round(gross_amount * 100)::bigint;

alter table public.employee_period_metrics
  alter column base_amount type bigint
  using round(base_amount * 100)::bigint;

alter table public.employee_period_metrics
  alter column sales_bonus type bigint
  using round(sales_bonus * 100)::bigint;

alter table public.employee_period_metrics
  alter column kpi_bonus type bigint
  using round(kpi_bonus * 100)::bigint;

alter table public.employee_period_metrics
  drop column total_compensation;

alter table public.employee_period_metrics
  add column total_compensation bigint generated always as
    (base_amount + sales_bonus + kpi_bonus) stored;

alter table public.sync_outbox
  add column if not exists entity_type text,
  add column if not exists entity_id text,
  add column if not exists operation text not null default 'upsert'
    check (operation in ('upsert', 'delete')),
  add column if not exists revision bigint not null default 1 check (revision > 0),
  add column if not exists claim_token uuid,
  add column if not exists locked_at timestamptz,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists synced_at timestamptz,
  add column if not exists source_updated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.sync_outbox
set
  entity_type = coalesce(entity_type, aggregate_type),
  entity_id = coalesce(entity_id, aggregate_id),
  operation = case when event_type = 'delete' then 'delete' else 'upsert' end,
  source_updated_at = coalesce(source_updated_at, created_at)
where entity_type is null or entity_id is null;

alter table public.sync_outbox
  alter column entity_type set not null,
  alter column entity_id set not null;

create or replace function public.enqueue_google_sheets_sync(
  p_entity_type text,
  p_entity_id text,
  p_operation text,
  p_payload jsonb,
  p_studio_id uuid,
  p_source_updated_at timestamptz default now()
)
returns public.sync_outbox
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.sync_outbox;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'enqueue_google_sheets_sync is service_role only'
      using errcode = '42501';
  end if;
  if p_studio_id is null then
    raise exception 'studio_id is required' using errcode = '22023';
  end if;
  if p_operation not in ('upsert', 'delete') then
    raise exception 'Invalid operation' using errcode = '22023';
  end if;

  insert into public.sync_outbox (
    studio_id, aggregate_type, aggregate_id, event_type, payload,
    entity_type, entity_id, operation, source_updated_at, next_attempt_at
  ) values (
    p_studio_id,
    p_entity_type,
    p_entity_id,
    p_operation,
    coalesce(p_payload, '{}'::jsonb),
    p_entity_type,
    p_entity_id,
    p_operation,
    p_source_updated_at,
    now()
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.claim_google_sheets_sync(
  p_batch_size integer,
  p_lease_seconds integer,
  p_max_attempts integer
)
returns table (
  outbox_id text,
  entity_type text,
  entity_id text,
  operation text,
  payload jsonb,
  source_updated_at timestamptz,
  revision bigint,
  claim_token uuid,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'claim_google_sheets_sync is service_role only'
      using errcode = '42501';
  end if;

  return query
  with picked as (
    select o.id
    from public.sync_outbox o
    where o.status in ('pending', 'failed')
      and o.attempts < p_max_attempts
      and o.next_attempt_at <= now()
      and (o.locked_at is null or o.locked_at < now() - make_interval(secs => p_lease_seconds))
    order by o.created_at
    limit greatest(1, least(p_batch_size, 200))
    for update skip locked
  )
  update public.sync_outbox o
  set
    status = 'processing',
    attempts = o.attempts + 1,
    claim_token = gen_random_uuid(),
    locked_at = now(),
    updated_at = now(),
    revision = o.revision + 1
  from picked
  where o.id = picked.id
  returning
    o.id::text,
    o.entity_type,
    o.entity_id,
    o.operation,
    o.payload,
    o.source_updated_at,
    o.revision,
    o.claim_token,
    o.attempts;
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
      studio_id, aggregate_type, aggregate_id, event_type, payload,
      entity_type, entity_id, operation, source_updated_at
    ) values (
      v_studio_id,
      tg_table_name,
      v_id,
      lower(tg_op),
      jsonb_build_object('record', v_row - 'token_hash', 'occurred_at', now()),
      tg_table_name,
      v_id,
      case when tg_op = 'DELETE' then 'delete' else 'upsert' end,
      now()
    );
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_google_sheets_sync(text, text, text, jsonb, uuid, timestamptz) from public;
revoke all on function public.claim_google_sheets_sync(integer, integer, integer) from public;

commit;
