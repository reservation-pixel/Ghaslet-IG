-- Rename admin → manager, agent → viewer
update app_users set role = 'manager' where role = 'admin';
update app_users set role = 'viewer'  where role = 'agent';

alter table app_users drop constraint if exists app_users_role_check;
alter table app_users add constraint app_users_role_check
  check (role in ('superadmin', 'manager', 'viewer'));
