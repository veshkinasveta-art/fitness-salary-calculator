# Supabase setup

The Supabase artifacts are self-contained under `supabase/`. The migration is
designed for PostgreSQL 15 and does not require a service-role key in any
client.

## Local setup

Prerequisites:

- Docker Desktop
- Supabase CLI

From the repository root:

```bash
supabase start
supabase db reset
supabase status
```

`db reset` applies `supabase/migrations/0001_initial.sql`,
`supabase/migrations/0002_kopecks_and_sheets.sql` and then `supabase/seed.sql`.
The seed is intentionally empty because tenant records must belong to a real
`auth.users` identity. Monetary columns store integer kopecks, and the studio
currency default is `RUB`.

Use only the local API URL and local anon key printed by `supabase status` in a
browser or mobile client. The service-role key bypasses RLS and must stay in a
trusted server/secret manager; it must never be committed, bundled, logged, or
sent to a client.

This task does not link a Supabase project or apply any migration remotely.
When deployment is intentionally approved, review the generated diff first and
use the normal Supabase CLI migration workflow from a trusted operator machine.

## Authentication and first studio

1. Create/sign in a local Auth user.
2. Upsert that user's `profiles` row with `id = auth.uid()`.
3. Insert a `studios` row with `created_by = auth.uid()`.
4. The `studios_add_owner` trigger atomically creates the initial
   `studio_members` owner row.

Do not insert the first membership separately.

## Authorization model

- `viewer`: read-only access to studio business data and audit history.
- `manager`: viewer access plus writes to employees, products, plans, rules,
  periods, sales, and calculated metrics.
- `owner`: manager access plus studio settings, membership, and invitation
  administration. Outbox inspection is owner-only.

All tenant tables have RLS enabled. Access is derived from
`studio_members`; application-supplied role claims are not trusted. Snapshot,
audit, and outbox writes are trigger/function controlled.

## Optimistic concurrency

Mutable records expose `updated_at` and `version`. The database increments both
on every update. Clients should update with both the primary key and the
previous version:

```text
UPDATE ... WHERE id = :id AND version = :expected_version
```

With Supabase, add `.eq("version", expectedVersion)` and request the affected
row. Zero returned rows means the record changed and must be reloaded. Clients
must not calculate the next version themselves.

## Invitations

Generate invite tokens with a cryptographically secure random source (at least
32 random bytes, base64url encoded). Store only the hash:

```sql
insert into public.studio_invites
  (studio_id, email, role, token_hash, expires_at, created_by)
values
  (
    :studio_id,
    lower(:email),
    :role,
    extensions.digest(:raw_token, 'sha256'),
    now() + interval '48 hours',
    auth.uid()
  );
```

Send the raw token once over the chosen delivery channel; never persist it in
logs or analytics. An authenticated recipient accepts it with:

```sql
select public.accept_invite(:raw_token);
```

Acceptance locks the invite, verifies expiry, single use, authenticated email,
and existing membership, then inserts the member and marks the invite accepted
in one transaction. Only `manager` and `viewer` invitations are allowed;
ownership changes require an explicit owner-controlled membership operation.

## Period calculation and closing

Application calculation code writes `employee_period_metrics` and changes the
period from `draft` to `calculated`, setting `calculated_at`. Closing is only
through:

```sql
select public.close_period(:period_id);
```

The function locks the period, requires owner/manager access, verifies that it
is calculated and has metrics, writes one immutable snapshot per employee, and
marks the period closed in the same transaction. The snapshot is a versioned
skeleton containing plan/rule inputs, metrics, and calculated totals; extend
its payload schema when calculation semantics are finalized. Closed periods,
their sales/metrics, and all snapshots reject mutation.

## Audit and outbox

Business mutations create `audit_log` entries and pending `sync_outbox` events.
Invitation hashes are removed from both payloads. Audit rows have no client
write policy. Outbox rows have no client write policy; a trusted backend worker
may process them with a server-side service role, updating `status`,
`attempts`, `processed_at`, and `last_error`.

Trigger delivery is transactional: an event exists only if the originating
mutation commits. Consumers must still be idempotent because delivery can be
at least once.

## Operational checks before production

- Run `supabase db reset` in a clean local environment.
- Add integration tests for each role and every RLS-protected table.
- Test concurrent invite acceptance and concurrent period closing.
- Define retention/export policies for `audit_log` and `sync_outbox`.
- Add scheduled cleanup for expired invitations and processed outbox records.
- Confirm the chosen Auth provider supplies a verified email; invitation
  acceptance binds to the email in the authenticated JWT.
- Review plan/snapshot JSON schemas and calculation rounding rules before using
  snapshots for payroll.
