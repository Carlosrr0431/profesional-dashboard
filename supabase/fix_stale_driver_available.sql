-- Limpia choferes con is_available=true sin presencia real
-- (sin coords o sin actualización reciente).
-- Ejecutar manualmente en el SQL Editor de Supabase si hace falta.

UPDATE public.drivers
SET
  is_available = false,
  updated_at = NOW()
WHERE is_available = true
  AND (
    current_lat IS NULL
    OR current_lng IS NULL
    OR updated_at < NOW() - INTERVAL '15 minutes'
  );
