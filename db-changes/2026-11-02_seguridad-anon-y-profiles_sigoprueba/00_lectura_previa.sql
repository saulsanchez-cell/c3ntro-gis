-- Que hace: comprueba que la base esta como se midio el 2026-11-02 antes del cambio (solo lectura): politicas de profiles y de las 2 tablas de lectura, que no existen las politicas nuevas, y cuantas de las 13 tablas viejas dan privilegios a anon y TRUNCATE a authenticated.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual.
-- Resultado esperado: 1 fila con todo_listo = true. tablas_con_anon y tablas_con_truncate_auth son informativas (en SIGOprueba: 13 y 13).
-- Corrido en SIGOprueba el 2026-11-02: todo_listo = true (13, 13). Corrido en produccion el 2026-11-02: resultado esperado (reportado por Saul).

with tablas (t) as (values
  ('catalogo_observaciones_qa'), ('checklist_borradores'), ('checklist_items'), ('checklist_respuestas'),
  ('checklist_resultados'), ('checklist_versiones'), ('historial_estados'), ('log_distancia'),
  ('logs_actividad'), ('metas_proyecto'), ('profiles'), ('transiciones_permitidas'), ('unidades_operativas')
)
select (select count(*) = 13 from tablas where to_regclass('public.' || t) is not null)          as existen_las_13,
       exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                 and policyname = 'auth_all_profiles' and cmd = 'ALL' and roles = '{authenticated}'
                 and qual = 'true')                                                            as profiles_politica_abierta,
       not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                     and policyname <> 'auth_all_profiles')                                    as profiles_sin_otras,
       exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'read_catalogo'
                 and tablename = 'catalogo_observaciones_qa' and roles = '{public}')           as read_catalogo_public,
       exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'read_transiciones'
                 and tablename = 'transiciones_permitidas' and roles = '{public}')             as read_transiciones_public,
       has_function_privilege('authenticated', 'public.es_coordinador()', 'execute')           as es_coordinador_ejecutable,
       (select count(*) from tablas
         where has_table_privilege('anon', 'public.' || t, 'select, insert, update, delete, truncate, references, trigger')) as tablas_con_anon,
       (select count(*) from tablas
         where has_table_privilege('authenticated', 'public.' || t, 'truncate'))               as tablas_con_truncate_auth,
       (select count(*) = 13 from tablas where to_regclass('public.' || t) is not null)
         and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                       and policyname = 'auth_all_profiles' and cmd = 'ALL' and roles = '{authenticated}' and qual = 'true')
         and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                           and policyname <> 'auth_all_profiles')
         and exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'read_catalogo'
                       and tablename = 'catalogo_observaciones_qa' and roles = '{public}')
         and exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'read_transiciones'
                       and tablename = 'transiciones_permitidas' and roles = '{public}')
         and has_function_privilege('authenticated', 'public.es_coordinador()', 'execute')     as todo_listo;
