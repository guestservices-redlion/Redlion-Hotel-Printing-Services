-- RLS remains enabled and browser roles remain denied. Grant the trusted
-- server role the table privileges required by the Hotel Print API.

grant select, insert, update, delete on table public.hotel_settings to service_role;
grant select, insert, update, delete on table public.admin_users to service_role;
grant select, insert, update, delete on table public.admin_sessions to service_role;
grant select, insert, update, delete on table public.print_jobs to service_role;

revoke all on table public.hotel_settings from anon, authenticated;
revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.admin_sessions from anon, authenticated;
revoke all on table public.print_jobs from anon, authenticated;
