-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- No se ha aplicado en producción ni en SIGOprueba.
-- SUPERADO: NO CORRER. Lo hace el paso 3 de
-- 2026-11-02_seguridad-anon-y-profiles_sigoprueba/01_escribe_cambio.sql
-- (y su reversa, 2026-11-02_seguridad-anon-y-profiles_reversa.sql).
--
-- Restringe a `authenticated` las políticas de solo lectura que siguen TO public.
-- Antes de aplicar, confirmar que ninguna pantalla lee estas tablas sin sesión
-- (p. ej. el login).
--
-- Reversa: PROPUESTO_politicas-lectura-a-authenticated_reversa.sql
-- =============================================================================

begin;

alter policy read_catalogo     on public.catalogo_observaciones_qa to authenticated;
alter policy read_transiciones on public.transiciones_permitidas   to authenticated;

commit;
