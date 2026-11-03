-- Que hace: comprueba que la base esta como se midio el 2026-11-03 antes de la fase 2 (solo lectura): unidades_operativas con una sola politica (auth_all_uo, abierta), es_coordinador() de la fase 1, y que no existe el trigger nuevo.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual.
-- Resultado esperado: 1 fila con todo en true y todo_listo = true.
-- Corrido en SIGOprueba el 2026-11-03: todo_listo = true (tambien por MCP). Corrido en produccion el 2026-11-03: resultado esperado (reportado por Saul).

select (select count(*) = 1 from pg_policies where schemaname = 'public' and tablename = 'unidades_operativas')   as una_politica,
       exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'unidades_operativas'
                 and policyname = 'auth_all_uo' and cmd = 'ALL' and roles = '{authenticated}' and qual = 'true') as auth_all_uo_abierta,
       md5(replace(pg_get_functiondef('public.es_coordinador()'::regprocedure), E'\r', ''))
         = '9ed2b30dd261b6d3243aad357c727dad'                                                                    as es_coordinador_fase1,
       to_regprocedure('public.proteger_columnas_uo()') is null                                                  as sin_funcion_nueva,
       (select count(*) = 1 from pg_policies where schemaname = 'public' and tablename = 'unidades_operativas')
         and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'unidades_operativas'
                       and policyname = 'auth_all_uo' and cmd = 'ALL' and roles = '{authenticated}' and qual = 'true')
         and md5(replace(pg_get_functiondef('public.es_coordinador()'::regprocedure), E'\r', '')) = '9ed2b30dd261b6d3243aad357c727dad'
         and to_regprocedure('public.proteger_columnas_uo()') is null                                            as todo_listo;
