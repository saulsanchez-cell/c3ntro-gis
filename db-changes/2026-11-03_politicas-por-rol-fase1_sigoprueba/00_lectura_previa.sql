-- Que hace: comprueba que la base esta como se midio el 2026-11-03 antes de la fase 1 (solo lectura): huella de es_coordinador() (UUID fijo, no SECURITY DEFINER) y las 8 politicas abiertas que se reemplazan.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual.
-- Resultado esperado: 1 fila con todo en true y todo_listo = true. coordinadores_activos es informativo (SIGOprueba: 2; produccion: 2, Saul y Sergio).
-- Corrido en SIGOprueba el 2026-11-03: todo_listo = true (coordinadores_activos = 2). Corrido en produccion el 2026-11-03: resultado esperado (reportado por Saul).

with abiertas (tabla, politica) as (values
  ('catalogo_observaciones_qa', 'auth_all_catalogo'),
  ('checklist_borradores',      'borradores_access'),
  ('checklist_items',           'auth_all_chk_items'),
  ('checklist_respuestas',      'auth_all_chk_resp'),
  ('checklist_resultados',      'auth_all_chk_res'),
  ('checklist_versiones',       'auth_all_chk_ver'),
  ('historial_estados',         'auth_all_historial'),
  ('logs_actividad',            'auth_all_logs')
)
select md5(replace(pg_get_functiondef('public.es_coordinador()'::regprocedure), E'\r', ''))
         = '75ec39f839334607be2cde06b9459871'                                      as es_coordinador_igual,
       (select count(*) = 8 from abiertas a
          join pg_policies p on p.schemaname = 'public' and p.tablename = a.tabla and p.policyname = a.politica
                            and p.cmd = 'ALL' and p.roles = '{authenticated}' and p.qual = 'true')
                                                                                   as ocho_politicas_abiertas,
       not exists (select 1 from pg_policies p
                    where p.schemaname = 'public'
                      and p.policyname in ('catalogo_coordinador', 'chk_items_select', 'chk_items_coordinador', 'chk_versiones_select', 'chk_versiones_coordinador',
                                           'historial_select', 'historial_insert', 'borradores_propios',
                                           'chk_res_select', 'chk_res_insert', 'chk_res_coordinador',
                                           'chk_resp_select', 'chk_resp_insert', 'chk_resp_coordinador',
                                           'logs_select', 'logs_insert', 'logs_update', 'logs_delete'))
                                                                                   as sin_politicas_nuevas,
       (select count(*) from public.profiles where rol = 'coordinador' and activo is distinct from false)
                                                                                   as coordinadores_activos,
       md5(replace(pg_get_functiondef('public.es_coordinador()'::regprocedure), E'\r', '')) = '75ec39f839334607be2cde06b9459871'
         and (select count(*) = 8 from abiertas a
                join pg_policies p on p.schemaname = 'public' and p.tablename = a.tabla and p.policyname = a.politica
                                  and p.cmd = 'ALL' and p.roles = '{authenticated}' and p.qual = 'true')
         and not exists (select 1 from pg_policies p
                          where p.schemaname = 'public'
                            and p.policyname in ('catalogo_coordinador', 'chk_items_select', 'chk_items_coordinador', 'chk_versiones_select', 'chk_versiones_coordinador',
                                                 'historial_select', 'historial_insert', 'borradores_propios',
                                                 'chk_res_select', 'chk_res_insert', 'chk_res_coordinador',
                                                 'chk_resp_select', 'chk_resp_insert', 'chk_resp_coordinador',
                                                 'logs_select', 'logs_insert', 'logs_update', 'logs_delete'))
                                                                                   as todo_listo;
