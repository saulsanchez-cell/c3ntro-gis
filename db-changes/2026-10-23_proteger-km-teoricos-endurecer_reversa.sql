-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- REVERSA de 2026-10-23_proteger-km-teoricos-endurecer.sql
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD  <-- completar
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD  <-- completar
--
-- Deja la función como estaba el 2026-10-23: sin search_path fijo y con
-- EXECUTE para public, anon y authenticated. No toca datos.
-- =============================================================================

begin;

alter function public.proteger_km_teoricos() reset search_path;

grant execute on function public.proteger_km_teoricos() to public, anon, authenticated;

commit;
