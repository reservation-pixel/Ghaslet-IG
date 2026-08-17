-- Add the superadmin tier.
--
-- Existing 'admin' and 'agent' rows are untouched; this only widens what the
-- check constraint allows and enforces that at most one superadmin can exist.

alter table app_users drop constraint if exists app_users_role_check;

alter table app_users
  add constraint app_users_role_check
  check (role in ('superadmin', 'admin', 'agent'));

-- "Seed 1 superadmin" enforced by the database rather than by the seed script
-- remembering to check. A unique index over `role`, restricted to superadmin
-- rows, permits exactly one such row — a second insert fails with 23505.
create unique index if not exists idx_app_users_single_superadmin
  on app_users (role)
  where role = 'superadmin';
