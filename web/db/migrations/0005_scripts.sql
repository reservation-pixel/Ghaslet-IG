alter table automation_settings
  add column if not exists dm_system_prompt text;
