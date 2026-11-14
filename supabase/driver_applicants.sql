-- Aspirantes a chofer. Ejecutar en el editor SQL de Supabase.
-- El panel y la app escriben con la service role. No hay acceso anónimo.

create table if not exists public.driver_applicants (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  first_name text,
  last_name text,
  email text,
  dni text,
  vehicle_kind text,
  vehicle_year integer,
  vehicle_cc integer,
  status text not null default 'phone_verified',
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_applicants_status_check check (
    status in ('phone_verified', 'profile', 'documents', 'submitted', 'accepted', 'rejected')
  ),
  constraint driver_applicants_vehicle_kind_check check (
    vehicle_kind is null or vehicle_kind in ('car', 'moto')
  )
);

create table if not exists public.driver_applicant_sessions (
  token uuid primary key,
  applicant_id uuid not null references public.driver_applicants(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.driver_applicant_documents (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.driver_applicants(id) on delete cascade,
  doc_key text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  created_at timestamptz not null default now()
);

create index if not exists driver_applicant_documents_applicant_idx
  on public.driver_applicant_documents (applicant_id, doc_key);

create table if not exists public.driver_applicant_notifications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.driver_applicants(id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists driver_applicant_notifications_unread_idx
  on public.driver_applicant_notifications (created_at desc)
  where read_at is null;

alter table public.driver_applicants enable row level security;
alter table public.driver_applicant_sessions enable row level security;
alter table public.driver_applicant_documents enable row level security;
alter table public.driver_applicant_notifications enable row level security;

create unique index if not exists driver_applicants_email_lower_uidx
  on public.driver_applicants (lower(email))
  where email is not null and btrim(email) <> '';

create table if not exists public.driver_applicant_email_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.driver_applicant_email_codes enable row level security;

insert into storage.buckets (id, name, public)
values ('driver-applicant-docs', 'driver-applicant-docs', false)
on conflict (id) do nothing;
