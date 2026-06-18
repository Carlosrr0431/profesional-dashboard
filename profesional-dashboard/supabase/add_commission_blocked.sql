-- Migration: add commission_blocked field to drivers
-- Run this in the Supabase SQL Editor

-- 1. Add commission_blocked column (defaults to false)
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS commission_blocked boolean NOT NULL DEFAULT false;

-- 2. Optional: index for fast queries of blocked drivers
CREATE INDEX IF NOT EXISTS idx_drivers_commission_blocked
  ON public.drivers (commission_blocked)
  WHERE commission_blocked = true;

-- 3. Verify
SELECT id, full_name, pending_commission, commission_blocked
FROM public.drivers
ORDER BY created_at DESC
LIMIT 10;
