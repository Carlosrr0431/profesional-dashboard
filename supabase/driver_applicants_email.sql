-- Si ya corriste driver_applicants.sql, ejecutá este archivo completo.
-- Permite el alta por correo (código por Brevo) además del SMS.

alter table public.driver_applicants alter column phone drop not null;

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
