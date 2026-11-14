-- Permite dejar aceptada o rechazada la solicitud de un aspirante.
-- Ejecutar en el editor SQL de Supabase.

alter table public.driver_applicants drop constraint if exists driver_applicants_status_check;

alter table public.driver_applicants add constraint driver_applicants_status_check check (
  status in ('phone_verified', 'profile', 'documents', 'submitted', 'accepted', 'rejected')
);
