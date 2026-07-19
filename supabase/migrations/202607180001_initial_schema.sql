-- Hotel Print cloud schema.
-- All access is intentionally denied to browser roles. The trusted application
-- server uses a Supabase secret/service-role key and exposes the narrow API.

create extension if not exists pgcrypto;

create table public.hotel_settings (
  id smallint primary key default 1 check (id = 1),
  hotel_name text not null,
  free_page_limit integer not null check (free_page_limit >= 0),
  price_per_page_minor integer not null check (price_per_page_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  max_upload_bytes integer not null check (max_upload_bytes > 0),
  max_page_count integer not null check (max_page_count > 0),
  retention_hours integer not null check (retention_hours > 0),
  confirmation_timeout_minutes integer not null check (confirmation_timeout_minutes > 0),
  antivirus_required boolean not null default true,
  public_customer_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create unique index admin_users_username_lower_idx
  on public.admin_users (lower(username));

create table public.admin_sessions (
  id_hash text primary key,
  user_id uuid not null references public.admin_users(id) on delete cascade,
  csrf_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  public_reference text not null unique,
  confirmation_token_hash text,
  room_number text not null,
  last_name text not null,
  original_filename text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type = 'application/pdf'),
  file_size bigint not null check (file_size >= 0),
  page_count integer check (page_count is null or page_count > 0),
  free_page_limit_snapshot integer,
  chargeable_pages integer,
  price_per_page_minor_snapshot integer,
  currency_snapshot text,
  total_minor integer,
  status text not null check (status in (
    'QUARANTINED', 'AWAITING_CONFIRMATION', 'QUEUED', 'COMPLETED',
    'REJECTED', 'CANCELLED', 'EXPIRED'
  )),
  scan_status text not null check (scan_status in (
    'PENDING', 'CLEAN', 'INFECTED', 'ERROR', 'BYPASSED'
  )),
  scan_completed_at timestamptz,
  created_at timestamptz not null default now(),
  confirmation_expires_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz
);

create index print_jobs_status_created_idx
  on public.print_jobs (status, created_at desc);
create index print_jobs_confirmation_expiry_idx
  on public.print_jobs (status, confirmation_expires_at);
create index print_jobs_retention_expiry_idx
  on public.print_jobs (status, expires_at);
create index admin_sessions_expiry_idx
  on public.admin_sessions (expires_at);

insert into public.hotel_settings (
  id, hotel_name, free_page_limit, price_per_page_minor, currency,
  max_upload_bytes, max_page_count, retention_hours,
  confirmation_timeout_minutes, antivirus_required, public_customer_url
) values (
  1, 'Red Lion Hotel Print Service', 3, 50, 'USD',
  10485760, 100, 24, 15, true, 'http://localhost:3000/'
) on conflict (id) do nothing;

-- The files bucket is private. PDFs must never receive public object URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'guest-documents',
  'guest-documents',
  false,
  10485760,
  array['application/pdf']
) on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.hotel_settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.print_jobs enable row level security;

revoke all on public.hotel_settings from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;
revoke all on public.admin_sessions from anon, authenticated;
revoke all on public.print_jobs from anon, authenticated;

-- No anon/authenticated policies are created. The application server is the
-- only data boundary and uses a secret key that must never reach browser code.
