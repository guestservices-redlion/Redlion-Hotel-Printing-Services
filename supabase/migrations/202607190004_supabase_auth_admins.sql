create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  email text not null unique,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index if not exists admin_profiles_username_lower_idx
  on public.admin_profiles (lower(username));

alter table public.admin_profiles enable row level security;
revoke all on public.admin_profiles from anon, authenticated;
grant select, insert, update, delete on public.admin_profiles to service_role;
