-- Corrige usuarios de auth con columnas NULL que provocan:
-- "Database error querying schema" al iniciar sesión.
--
-- IMPORTANTE:
-- - NO incluir ALTER TABLE auth.users (falla con "must be owner of table users").
-- - Ejecutar SOLO los UPDATE, uno por uno o todos juntos SIN BEGIN/COMMIT.
-- - Si algún UPDATE también falla con 42501, usar el script:
--   profesional-dashboard/scripts/fix-driver-auth-users.mjs

UPDATE auth.users
SET confirmation_token = ''
WHERE confirmation_token IS NULL;

UPDATE auth.users
SET recovery_token = ''
WHERE recovery_token IS NULL;

UPDATE auth.users
SET email_change_token_new = ''
WHERE email_change_token_new IS NULL;

UPDATE auth.users
SET email_change = ''
WHERE email_change IS NULL;
