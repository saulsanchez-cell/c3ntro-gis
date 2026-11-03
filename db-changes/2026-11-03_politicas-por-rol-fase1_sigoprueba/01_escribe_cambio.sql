-- Que hace: politicas por rol, fase 1. es_coordinador() pasa a "perfil con rol coordinador y activo" y las 8 politicas de escritura abiertas (USING true) de catalogos, checklist, historial y logs se reemplazan por reglas por rol y por relacion con la UO; escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual (ver ../2026-11-03_politicas-por-rol_produccion/README-fase1.md).
-- Reversa: db-changes/2026-11-03_politicas-por-rol-fase1_reversa.sql
-- Resultado esperado: sin filas y sin error. Si aborta porque la base no esta como en el 00, no queda nada escrito: mandar el mensaje completo.
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-11-03
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-11-03
--
-- Decisiones (aprobadas por Saul el 2026-11-03):
--   - Coordinador = perfil con rol 'coordinador' y activo (ya no el UUID fijo).
--     En produccion: Saul y Sergio Canales (para emergencias). Desde el
--     2026-11-02 solo un coordinador puede cambiar roles en profiles.
--     Afecta a todo lo que usa es_coordinador(): marcar, desmarcar,
--     ajustar_hora y reprogramar_actividad, y las politicas de profiles.
--     NO afecta a proteger_km_teoricos (tiene su propio UUID fijo y esta en
--     "no tocar"): solo el coordinador fijo cambia km_teoricos.
--   - Logs: Edgar Molina y Martin Alcantar son cuentas de apoyo que cargan
--     UOs de otros. Por eso cada quien escribe y edita SUS logs en cualquier
--     UO (no solo en las suyas); nadie puede escribir a nombre de otro.
--
-- es_coordinador() pasa a SECURITY DEFINER: lee profiles sin depender de su
-- RLS (y sin recursion en las politicas de profiles que la usan).
--
-- Reglas nuevas (leer sigue abierto para authenticated en todas):
--   catalogo_observaciones_qa, checklist_items, checklist_versiones
--       escribir: solo coordinador (la app no escribe en ellas).
--   historial_estados
--       insertar: solo con usuario_id = la sesion. Nadie edita ni borra
--       (registro de solo insercion; el DELETE en cascada de una UO no pasa
--       por RLS y sigue funcionando).
--   checklist_borradores
--       todo: solo los propios (usuario_id = la sesion).
--   checklist_resultados
--       insertar: analista_id = la sesion, y ser el analista QA de la UO o
--       coordinador. Editar y borrar: solo coordinador.
--   checklist_respuestas
--       insertar: solo en un resultado propio (analista_id = la sesion).
--       Editar y borrar: solo coordinador.
--   logs_actividad (en "no tocar": tocado con autorizacion, solo politicas)
--       insertar y editar: solo los propios (usuario_id = la sesion), en
--       cualquier UO. Borrar: solo coordinador.
--   Un UPDATE o DELETE que la regla no permite no da error: afecta 0 filas.
--   Un INSERT que no la cumple da 42501 (new row violates row-level security).
--
-- Queda abierta: unidades_operativas (auth_all_uo), en la fase 2.
-- Las funciones SECURITY DEFINER (triggers, RPC) no pasan por RLS: no cambian.

begin;

do $$
begin
  if md5(replace(pg_get_functiondef('public.es_coordinador()'::regprocedure), E'\r', ''))
       is distinct from '75ec39f839334607be2cde06b9459871' then
    raise exception 'es_coordinador() no es la version medida el 2026-11-03 (md5 distinto). Abortado.';
  end if;
  if (select count(*) from pg_policies p
        join (values ('catalogo_observaciones_qa', 'auth_all_catalogo'), ('checklist_borradores', 'borradores_access'),
                     ('checklist_items', 'auth_all_chk_items'), ('checklist_respuestas', 'auth_all_chk_resp'),
                     ('checklist_resultados', 'auth_all_chk_res'), ('checklist_versiones', 'auth_all_chk_ver'),
                     ('historial_estados', 'auth_all_historial'), ('logs_actividad', 'auth_all_logs')) as a(tabla, politica)
          on p.tablename = a.tabla and p.policyname = a.politica
       where p.schemaname = 'public' and p.cmd = 'ALL' and p.roles = '{authenticated}' and p.qual = 'true') <> 8 then
    raise exception 'Las 8 politicas abiertas no estan como se midieron el 2026-11-03. Abortado.';
  end if;
  if not exists (select 1 from public.profiles where rol = 'coordinador' and activo is distinct from false) then
    raise exception 'No hay ningun perfil coordinador activo: nadie podria administrar. Abortado.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Coordinador por rol
-- -----------------------------------------------------------------------------

create or replace function public.es_coordinador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.rol = 'coordinador' and p.activo is distinct from false
                     from public.profiles p
                    where p.id = auth.uid()), false)
$$;

revoke all on function public.es_coordinador() from public, anon, authenticated;
grant execute on function public.es_coordinador() to authenticated;

-- -----------------------------------------------------------------------------
-- Catalogos: solo el coordinador escribe
-- -----------------------------------------------------------------------------

drop policy auth_all_catalogo on public.catalogo_observaciones_qa;
-- read_catalogo (SELECT, authenticated) se queda
create policy catalogo_coordinador on public.catalogo_observaciones_qa
  for all to authenticated using (public.es_coordinador()) with check (public.es_coordinador());

drop policy auth_all_chk_items on public.checklist_items;
create policy chk_items_select on public.checklist_items
  for select to authenticated using (true);
create policy chk_items_coordinador on public.checklist_items
  for all to authenticated using (public.es_coordinador()) with check (public.es_coordinador());

drop policy auth_all_chk_ver on public.checklist_versiones;
create policy chk_versiones_select on public.checklist_versiones
  for select to authenticated using (true);
create policy chk_versiones_coordinador on public.checklist_versiones
  for all to authenticated using (public.es_coordinador()) with check (public.es_coordinador());

-- -----------------------------------------------------------------------------
-- historial_estados: solo insercion, con el propio usuario
-- -----------------------------------------------------------------------------

drop policy auth_all_historial on public.historial_estados;
create policy historial_select on public.historial_estados
  for select to authenticated using (true);
create policy historial_insert on public.historial_estados
  for insert to authenticated with check (usuario_id = auth.uid());

-- -----------------------------------------------------------------------------
-- checklist_borradores: solo los propios
-- -----------------------------------------------------------------------------

drop policy borradores_access on public.checklist_borradores;
create policy borradores_propios on public.checklist_borradores
  for all to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- -----------------------------------------------------------------------------
-- checklist_resultados y checklist_respuestas
-- -----------------------------------------------------------------------------

drop policy auth_all_chk_res on public.checklist_resultados;
create policy chk_res_select on public.checklist_resultados
  for select to authenticated using (true);
create policy chk_res_insert on public.checklist_resultados
  for insert to authenticated
  with check (analista_id = auth.uid()
              and (public.es_coordinador()
                   or exists (select 1 from public.unidades_operativas u
                               where u.id = uo_id and u.analista_qa_id = auth.uid())));
create policy chk_res_coordinador on public.checklist_resultados
  for all to authenticated using (public.es_coordinador()) with check (public.es_coordinador());

drop policy auth_all_chk_resp on public.checklist_respuestas;
create policy chk_resp_select on public.checklist_respuestas
  for select to authenticated using (true);
create policy chk_resp_insert on public.checklist_respuestas
  for insert to authenticated
  with check (exists (select 1 from public.checklist_resultados r
                       where r.id = resultado_id and r.analista_id = auth.uid()));
create policy chk_resp_coordinador on public.checklist_respuestas
  for all to authenticated using (public.es_coordinador()) with check (public.es_coordinador());

-- -----------------------------------------------------------------------------
-- logs_actividad: los propios, en cualquier UO; borrar solo el coordinador
-- -----------------------------------------------------------------------------

drop policy auth_all_logs on public.logs_actividad;
create policy logs_select on public.logs_actividad
  for select to authenticated using (true);
create policy logs_insert on public.logs_actividad
  for insert to authenticated with check (usuario_id = auth.uid());
create policy logs_update on public.logs_actividad
  for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy logs_delete on public.logs_actividad
  for delete to authenticated using (public.es_coordinador());

commit;
