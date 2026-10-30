-- Ficha de reposo de la ticketera (viaje sin destino).
-- Ejecutar en el editor SQL de Supabase.
-- El valor inicial es la décima parte del $/km actual (100 m), igual que hasta ahora.
-- Después se cambia en Tarifas: $ / ficha de reposo.

insert into public.settings (key, value, updated_at)
select
  'platform_tariff_wait_ficha',
  coalesce(
    (
      select round(
        nullif(regexp_replace(value, '[^0-9.]', '', 'g'), '')::numeric / 10
      )::text
      from public.settings
      where key = 'platform_tariff_per_km'
      limit 1
    ),
    '100'
  ),
  now()
where not exists (
  select 1 from public.settings where key = 'platform_tariff_wait_ficha'
);
