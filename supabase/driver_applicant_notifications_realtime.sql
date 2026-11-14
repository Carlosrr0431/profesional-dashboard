-- Avisos de aspirantes en vivo para el panel.
-- Ejecutar en el editor SQL de Supabase después de driver_applicants.sql.

alter table public.driver_applicant_notifications replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.driver_applicant_notifications;
exception
  when duplicate_object then null;
end $$;

drop policy if exists driver_applicant_notifications_operator_read
  on public.driver_applicant_notifications;

create policy driver_applicant_notifications_operator_read
  on public.driver_applicant_notifications
  for select
  to authenticated
  using (
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'carlos.facundo.rr@gmail.com'
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
  );
