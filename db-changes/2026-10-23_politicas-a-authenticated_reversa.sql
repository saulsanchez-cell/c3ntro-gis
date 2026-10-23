-- =============================================================================
-- REVERSA de 2026-10-23_politicas-a-authenticated.sql
-- Regresa las políticas RLS a TO public (vuelve a permitir acceso con anon).
-- Usar solo si la restricción rompe algo y hay que volver al estado anterior.
--
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-10-23
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-10-23
-- (fechas en que se aplicó el cambio que esta reversa deshace)
-- =============================================================================

begin;

alter policy auth_all_catalogo  on public.catalogo_observaciones_qa to public;
alter policy borradores_access  on public.checklist_borradores      to public;
alter policy auth_all_chk_items on public.checklist_items           to public;
alter policy auth_all_chk_resp  on public.checklist_respuestas      to public;
alter policy auth_all_chk_res   on public.checklist_resultados      to public;
alter policy auth_all_chk_ver   on public.checklist_versiones       to public;
alter policy auth_all_historial on public.historial_estados         to public;
alter policy auth_all_logs      on public.logs_actividad            to public;
alter policy auth_all_profiles  on public.profiles                  to public;
alter policy auth_all_uo        on public.unidades_operativas       to public;

commit;
