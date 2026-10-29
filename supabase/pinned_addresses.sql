-- Direcciones fijas cargadas desde el panel.
-- Hay que pegar este archivo en el editor SQL de Supabase.

create table if not exists public.pinned_addresses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

alter table public.pinned_addresses enable row level security;

drop policy if exists pinned_addresses_public_read on public.pinned_addresses;
create policy pinned_addresses_public_read
  on public.pinned_addresses
  for select
  to anon, authenticated
  using (true);

grant select on public.pinned_addresses to anon, authenticated;
grant all on public.pinned_addresses to service_role;

alter table public.pinned_addresses replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pinned_addresses'
  ) then
    alter publication supabase_realtime add table public.pinned_addresses;
  end if;
end $$;

insert into public.pinned_addresses (title, lat, lng)
select 'Santa Ana 1, Pasaje 20, Casa 1421', -24.8638868, -65.4731354
where not exists (
  select 1 from public.pinned_addresses
  where title = 'Santa Ana 1, Pasaje 20, Casa 1421'
);

insert into public.pinned_addresses (title, lat, lng)
select 'Santa Rita 2, La Isla, Manzana 20, Casa 5', -24.8772243, -65.4034545
where not exists (
  select 1 from public.pinned_addresses
  where title = 'Santa Rita 2, La Isla, Manzana 20, Casa 5'
);

insert into public.pinned_addresses (title, lat, lng)
select 'Barrio Río Ancho, Casa 2, Gomería', -24.8533069, -65.4045727
where not exists (
  select 1 from public.pinned_addresses
  where title = 'Barrio Río Ancho, Casa 2, Gomería'
);
