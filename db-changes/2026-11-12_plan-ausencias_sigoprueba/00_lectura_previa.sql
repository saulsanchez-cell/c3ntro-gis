-- Que hace: revisa que la base este como se midio el 2026-11-12 antes de agregar las ausencias por persona y los feriados desde la app (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf) y despues produccion (rtwjwfpaturmbmegwtys), tal cual.
-- Resultado esperado: 1 fila con todo_listo = true. Si sale false, NO correr el 01 y mandar la fila completa.
-- Medido en SIGOprueba por MCP el 2026-11-12: todo_listo = true. Corrido en produccion el 2026-11-12 antes del 01.

select
  to_regclass('public.plan_ausencias') is null                                           as sin_plan_ausencias,
  to_regprocedure('public.plan_ausencia_persona(uuid,date)') is null                      as sin_plan_ausencia_persona,
  md5(replace(pg_get_functiondef('public.plan_carga_persona(uuid,date)'::regprocedure), E'\r', ''))
    = 'c11dce94a0a74e77ce9f2afd1244d7c7'                                                  as plan_carga_persona_igual,
  md5(replace(pg_get_functiondef('public.proponer_fechas_uo(uuid,date)'::regprocedure), E'\r', ''))
    = '77bdbd410611bbd0ab7b03c86dc4ebb3'                                                  as proponer_fechas_uo_igual,
  md5(replace(pg_get_functiondef('public.proponer_validacion_uo(uuid,date)'::regprocedure), E'\r', ''))
    = '46f86cfe5391feae38acb7dff95dc9be'                                                  as proponer_validacion_uo_igual,
  md5(replace(pg_get_functiondef('public.es_coordinador()'::regprocedure), E'\r', ''))
    = '9ed2b30dd261b6d3243aad357c727dad'                                                  as es_coordinador_igual,
  (select array_agg(policyname::text order by policyname) from pg_policies
    where schemaname = 'public' and tablename = 'plan_dias_inhabiles')
    = array['plan_dias_inhabiles_select']                                                 as feriados_solo_lectura,
  has_table_privilege('authenticated', 'public.plan_dias_inhabiles', 'select')
    and not has_table_privilege('authenticated', 'public.plan_dias_inhabiles', 'insert')
    and not has_table_privilege('authenticated', 'public.plan_dias_inhabiles', 'delete')
    and not has_table_privilege('anon', 'public.plan_dias_inhabiles', 'select')           as feriados_privilegios,
  (select count(*) from public.plan_dias_inhabiles)                                       as feriados_cargados,
  (to_regclass('public.plan_ausencias') is null
   and to_regprocedure('public.plan_ausencia_persona(uuid,date)') is null
   and md5(replace(pg_get_functiondef('public.plan_carga_persona(uuid,date)'::regprocedure), E'\r', '')) = 'c11dce94a0a74e77ce9f2afd1244d7c7'
   and md5(replace(pg_get_functiondef('public.proponer_fechas_uo(uuid,date)'::regprocedure), E'\r', '')) = '77bdbd410611bbd0ab7b03c86dc4ebb3'
   and md5(replace(pg_get_functiondef('public.proponer_validacion_uo(uuid,date)'::regprocedure), E'\r', '')) = '46f86cfe5391feae38acb7dff95dc9be'
   and md5(replace(pg_get_functiondef('public.es_coordinador()'::regprocedure), E'\r', '')) = '9ed2b30dd261b6d3243aad357c727dad'
   and (select array_agg(policyname::text order by policyname) from pg_policies
         where schemaname = 'public' and tablename = 'plan_dias_inhabiles') = array['plan_dias_inhabiles_select']
   and not has_table_privilege('authenticated', 'public.plan_dias_inhabiles', 'insert')
   and not has_table_privilege('anon', 'public.plan_dias_inhabiles', 'select'))          as todo_listo;
