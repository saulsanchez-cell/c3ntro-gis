-- Que hace: revisa SECURITY DEFINER, search_path y EXECUTE de las 13 funciones nuevas o modificadas (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 13 filas; search_path_vacio = true y anon_execute = false en todas; authenticated_execute = true solo en reprogramar_actividad.

-- security_definer = true solo en proponer_fechas_uo, reprogramar_actividad,
-- generar_actividades_uo y reasignar_actividades_uo.
select p.oid::regprocedure                                     as funcion,
       p.prosecdef                                             as security_definer,
       coalesce(p.proconfig @> array['search_path=""'], false) as search_path_vacio,
       has_function_privilege('anon', p.oid, 'execute')          as anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('plan_hoy', 'plan_capacidad_dia', 'plan_parametro', 'plan_rendimiento',
                     'plan_jornadas_uo', 'plan_carga_persona', 'plan_sumar_dias_habiles',
                     'plan_dias_habiles_entre', 'plan_inconsistencias', 'proponer_fechas_uo',
                     'reprogramar_actividad', 'generar_actividades_uo', 'reasignar_actividades_uo')
 order by p.proname;
