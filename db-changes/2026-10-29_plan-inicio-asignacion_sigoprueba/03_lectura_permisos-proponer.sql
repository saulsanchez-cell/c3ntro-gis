-- Que hace: revisa SECURITY DEFINER, search_path, EXECUTE y que proponer_fechas_uo ya lee fecha_no_antes_de (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf).
-- Resultado esperado: 1 fila con security_definer, search_path_vacio y lee_la_columna en true; public_execute, anon_execute y authenticated_execute en false. Mandar huella_nueva (es la que usara produccion).
-- Corrido en SIGOprueba el 2026-10-29: resultado esperado

select p.oid::regprocedure                                       as funcion,
       p.prosecdef                                               as security_definer,
       coalesce(p.proconfig @> array['search_path=""'], false)   as search_path_vacio,
       has_function_privilege('public', p.oid, 'execute')        as public_execute,
       has_function_privilege('anon', p.oid, 'execute')          as anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
       p.prosrc like '%fecha_no_antes_de%'                       as lee_la_columna,
       md5(replace(pg_get_functiondef(p.oid), E'\r', ''))        as huella_nueva
  from pg_proc p
 where p.oid = 'public.proponer_fechas_uo(uuid,date)'::regprocedure;
