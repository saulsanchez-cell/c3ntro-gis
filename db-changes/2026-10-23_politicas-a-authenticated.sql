-- =============================================================================
-- *** APLICADO EN SIGOPRUEBA Y PRODUCCIÓN ***
-- Restringe a `authenticated` las políticas RLS de public que estaban TO public
-- (incluían al rol anon, o sea, acceso sin login con la anon key).
--
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-10-23
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-10-23
--
-- Reversa: 2026-10-23_politicas-a-authenticated_reversa.sql
--
-- Solo cambia el rol de cada política; las condiciones USING / WITH CHECK
-- quedan igual. log_distancia y metas_proyecto ya estaban TO authenticated.
-- read_catalogo y read_transiciones no se incluyen: ver
-- PROPUESTO_politicas-lectura-a-authenticated.sql
-- =============================================================================

begin;

alter policy auth_all_catalogo  on public.catalogo_observaciones_qa to authenticated;
alter policy borradores_access  on public.checklist_borradores      to authenticated;
alter policy auth_all_chk_items on public.checklist_items           to authenticated;
alter policy auth_all_chk_resp  on public.checklist_respuestas      to authenticated;
alter policy auth_all_chk_res   on public.checklist_resultados      to authenticated;
alter policy auth_all_chk_ver   on public.checklist_versiones       to authenticated;
alter policy auth_all_historial on public.historial_estados         to authenticated;
alter policy auth_all_logs      on public.logs_actividad            to authenticated;
alter policy auth_all_profiles  on public.profiles                  to authenticated;
alter policy auth_all_uo        on public.unidades_operativas       to authenticated;

commit;

-- Verificación: solo deben quedar read_catalogo y read_transiciones con rol {public}
-- select tablename, policyname, roles from pg_policies
-- where schemaname = 'public' and 'public' = any(roles);
