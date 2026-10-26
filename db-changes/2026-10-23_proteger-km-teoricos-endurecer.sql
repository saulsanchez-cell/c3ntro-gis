-- =============================================================================
-- *** APLICADO EN SIGOPRUEBA, PENDIENTE EN PRODUCCIÓN ***
-- Endurece public.proteger_km_teoricos() (trigger trg_proteger_km_teoricos en
-- unidades_operativas).
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-10-23
-- Aplicado en producción (rtwjwfpaturmbmegwtys): PENDIENTE
--
-- Reversa:  2026-10-23_proteger-km-teoricos-endurecer_reversa.sql
-- Pruebas:  2026-10-23_proteger-km-teoricos-endurecer_pruebas.sql (termina en rollback)
--
-- Cambia:
--   1. search_path = '' en la función. Es SECURITY DEFINER y hoy no fija
--      search_path, así que resuelve nombres con el search_path de quien hace
--      el UPDATE. El cuerpo ya usa nombres calificados (auth.uid()).
--   2. Quita EXECUTE a public, anon y authenticated. Hoy cualquiera, incluido
--      anon, tiene EXECUTE. Disparar el trigger no requiere EXECUTE de quien
--      hace el UPDATE (Postgres solo lo revisa en CREATE TRIGGER), así que la
--      protección sigue igual para la app. postgres y service_role lo conservan.
--
-- No cambia: el cuerpo, el mensaje "No tienes permiso para modificar
-- km_teoricos", SECURITY DEFINER, el trigger ni el UUID fijo del coordinador.
--
-- Después de aplicar en producción, regenerar schema.sql: hoy muestra la
-- función sin search_path y con GRANT ALL a anon y authenticated.
--
-- DEUDA TÉCNICA v2: igual que es_coordinador(), usa el UUID fijo del
-- coordinador (7063db07-ed16-4ca5-8c98-53b63d128702).
-- =============================================================================

begin;

alter function public.proteger_km_teoricos() set search_path = '';

revoke all on function public.proteger_km_teoricos() from public, anon, authenticated;

commit;
