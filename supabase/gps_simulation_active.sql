-- Ver driver-app/supabase/gps_simulation_active.sql
-- Simulación GPS remota desde el panel (Sim. GPS).

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS gps_simulation_active BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN drivers.gps_simulation_active IS
  'Dev: ubicación controlada desde el dashboard (Sim. GPS). La app del chofer ignora GPS real mientras esté activo.';
