-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- REVERSA de PROPUESTO_politicas-lectura-a-authenticated.sql
-- Regresa las políticas de lectura a TO public.
-- =============================================================================

begin;

alter policy read_catalogo     on public.catalogo_observaciones_qa to public;
alter policy read_transiciones on public.transiciones_permitidas   to public;

commit;
