-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- SUPERADO: NO CORRER. Lo hace el paso 3 de
-- 2026-11-02_seguridad-anon-y-profiles_sigoprueba/01_escribe_cambio.sql
-- (y su reversa, 2026-11-02_seguridad-anon-y-profiles_reversa.sql).
-- REVERSA de PROPUESTO_politicas-lectura-a-authenticated.sql
-- Regresa las políticas de lectura a TO public.
-- =============================================================================

begin;

alter policy read_catalogo     on public.catalogo_observaciones_qa to public;
alter policy read_transiciones on public.transiciones_permitidas   to public;

commit;
