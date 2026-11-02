-- Que hace: revisa permisos de la tabla y de las funciones de la validacion (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual.
-- Resultado esperado: 10 filas, todas con ok = true. Mandar las huellas (columna huella): son las que se anotan en CLAUDE.md y la reversa.
-- Corrido en produccion el 2026-11-02: 10 filas con ok = true y las mismas huellas.
-- Corrido en SIGOprueba el 2026-11-02: 10 filas con ok = true. Huellas (produccion debe dar las mismas):
--   cerrar_validacion_uo             0d98fd2d35983a2cbd7c1e2a6a904728
--   desmarcar_actividad              7e8e44851fd265638dd62864d28a86c8
--   generar_actividades_uo           e57bc7c6e80174c0733fbd456f88b20a
--   marcar_actividad                 b59dca6f4cc4878d94f700cc8cccca41
--   plan_carga_persona               c11dce94a0a74e77ce9f2afd1244d7c7
--   plan_inconsistencias_validacion  c1a3d65012d844449cab11b1991ffabe
--   proponer_validacion_uo           46f86cfe5391feae38acb7dff95dc9be
--   reasignar_validacion_uo          c49fd17f15ccd17e473ad4edcc3b671e
--   reprogramar_actividad            82f87e303148bd50c190188a72f5df72

with esperado (objeto, rpc, secdef) as (values
  ('public.proponer_validacion_uo(uuid,date)',          false, true),
  ('public.plan_inconsistencias_validacion()',          false, false),
  ('public.plan_carga_persona(uuid,date)',              false, false),
  ('public.reasignar_validacion_uo()',                  false, true),
  ('public.cerrar_validacion_uo()',                     false, true),
  ('public.generar_actividades_uo()',                   false, true),
  ('public.reprogramar_actividad(uuid,date,text)',      true,  true),
  ('public.marcar_actividad(uuid,timestamptz,text)',    true,  true),
  ('public.desmarcar_actividad(uuid,text)',             true,  true)
)
select e.objeto,
       p.prosecdef                                               as security_definer,
       coalesce(p.proconfig @> array['search_path=""'], false)   as search_path_vacio,
       has_function_privilege('public', p.oid, 'execute')        as public_execute,
       has_function_privilege('anon', p.oid, 'execute')          as anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
       md5(replace(pg_get_functiondef(p.oid), E'\r', ''))        as huella,
       p.prosecdef = e.secdef
         and coalesce(p.proconfig @> array['search_path=""'], false)
         and not has_function_privilege('public', p.oid, 'execute')
         and not has_function_privilege('anon', p.oid, 'execute')
         and has_function_privilege('authenticated', p.oid, 'execute') = e.rpc as ok
  from esperado e
  join pg_proc p on p.oid = e.objeto::regprocedure
union all
select 'tabla public.plan_carga_actividad',
       null, null, null, null, null, null,
       (select relrowsecurity from pg_class where oid = 'public.plan_carga_actividad'::regclass)
       and has_table_privilege('authenticated', 'public.plan_carga_actividad', 'select')
       and not has_table_privilege('authenticated', 'public.plan_carga_actividad', 'insert, update, delete, truncate')
       and not has_table_privilege('anon', 'public.plan_carga_actividad', 'select, insert, update, delete, truncate')
       and not has_table_privilege('public', 'public.plan_carga_actividad', 'select, insert, update, delete, truncate')
       and (select count(*) = 1 from pg_policies
             where schemaname = 'public' and tablename = 'plan_carga_actividad'
               and roles = '{authenticated}' and cmd = 'SELECT')
order by 1;
