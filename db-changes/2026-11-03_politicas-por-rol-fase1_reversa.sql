-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- REVERSA de 2026-11-03_politicas-por-rol-fase1. El cambio esta en
-- 2026-11-03_politicas-por-rol-fase1_sigoprueba/01_escribe_cambio.sql.
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD
--
-- Si la fase 2 ya se aplico, revertir primero la fase 2.
-- Devuelve la base a como estaba el 2026-11-03:
--   - es_coordinador() vuelve al UUID fijo, SECURITY INVOKER, copiada tal cual
--     de 2026-10-23_actividades-uo.sql (CREATE OR REPLACE sin SECURITY DEFINER
--     la deja como invoker). Sergio Canales deja de contar como coordinador.
--   - Las 16 politicas nuevas se quitan y se recrean las 8 abiertas.
-- Vuelve a abrir la escritura de esas 8 tablas: correrla solo si la fase 1
-- rompio algo.
--
-- Verificacion despues (cada una en su propia consulta):
--   select md5(replace(pg_get_functiondef('public.es_coordinador()'::regprocedure), E'\r', ''));
--     -> 75ec39f839334607be2cde06b9459871
--   03_lectura_auditoria-seguridad.sql de la carpeta de seguridad, con la lista
--   de conocidos anterior a este cambio (las 9 politicas abiertas).
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'logs_actividad'
                   and policyname = 'logs_insert') then
    raise exception 'logs_insert no existe: la fase 1 no esta aplicada. Abortado.';
  end if;
end $$;

drop policy catalogo_coordinador      on public.catalogo_observaciones_qa;
drop policy chk_items_select          on public.checklist_items;
drop policy chk_items_coordinador     on public.checklist_items;
drop policy chk_versiones_select      on public.checklist_versiones;
drop policy chk_versiones_coordinador on public.checklist_versiones;
drop policy historial_select          on public.historial_estados;
drop policy historial_insert          on public.historial_estados;
drop policy borradores_propios        on public.checklist_borradores;
drop policy chk_res_select            on public.checklist_resultados;
drop policy chk_res_insert            on public.checklist_resultados;
drop policy chk_res_coordinador       on public.checklist_resultados;
drop policy chk_resp_select           on public.checklist_respuestas;
drop policy chk_resp_insert           on public.checklist_respuestas;
drop policy chk_resp_coordinador      on public.checklist_respuestas;
drop policy logs_select               on public.logs_actividad;
drop policy logs_insert               on public.logs_actividad;
drop policy logs_update               on public.logs_actividad;
drop policy logs_delete               on public.logs_actividad;

create policy auth_all_catalogo  on public.catalogo_observaciones_qa for all to authenticated using (true) with check (true);
create policy borradores_access  on public.checklist_borradores      for all to authenticated using (true);
create policy auth_all_chk_items on public.checklist_items           for all to authenticated using (true) with check (true);
create policy auth_all_chk_resp  on public.checklist_respuestas      for all to authenticated using (true) with check (true);
create policy auth_all_chk_res   on public.checklist_resultados      for all to authenticated using (true) with check (true);
create policy auth_all_chk_ver   on public.checklist_versiones       for all to authenticated using (true) with check (true);
create policy auth_all_historial on public.historial_estados         for all to authenticated using (true) with check (true);
create policy auth_all_logs      on public.logs_actividad            for all to authenticated using (true) with check (true);

-- es_coordinador: de 2026-10-23_actividades-uo.sql, tal cual
create or replace function public.es_coordinador()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.uid() = '7063db07-ed16-4ca5-8c98-53b63d128702'::uuid, false)
$$;

revoke all on function public.es_coordinador() from public, anon, authenticated;
grant execute on function public.es_coordinador() to authenticated;

commit;
