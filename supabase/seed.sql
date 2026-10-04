begin;

-- Multi-tenant demo data must be owned by a real auth.users row. This seed is
-- intentionally non-destructive and creates no synthetic authentication users.
-- After signing in locally, create a studio through the API; the migration's
-- studios_add_owner trigger will add that user as its owner.
do $$
begin
  raise notice 'No shared seed data inserted; create tenant data as an authenticated local user.';
end;
$$;

commit;
