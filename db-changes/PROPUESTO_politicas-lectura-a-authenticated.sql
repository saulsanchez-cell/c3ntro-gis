-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- No se ha aplicado en producción ni en SIGOprueba.
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
