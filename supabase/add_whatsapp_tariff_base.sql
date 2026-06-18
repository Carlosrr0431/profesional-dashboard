-- Tarifa base reservada para la futura app de pasajeros.
-- Ejecutar manualmente en el editor SQL de Supabase.

INSERT INTO settings (key, value, updated_at)
VALUES ('passenger_app_tariff_base', '0', NOW())
ON CONFLICT (key) DO NOTHING;
