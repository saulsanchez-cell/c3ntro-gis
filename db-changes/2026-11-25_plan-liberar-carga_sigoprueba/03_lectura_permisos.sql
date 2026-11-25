-- Que hace: revisa permisos de plan_carga_liberada y de las 3 funciones cambiadas, y da sus huellas (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual.
-- Resultado esperado: 4 filas, todas con ok = true. Mandar las huellas: produccion debe dar las mismas que SIGOprueba,
--   y se anotan en CLAUDE.md.
-- Corrido en SIGOprueba el 2026-11-25 (por MCP): 4 filas con ok = true. Huellas (produccion debe dar las mismas):
--   desmarcar_actividad   5f9dc13ccd46630f0d1202b1bb4e3a97
--   marcar_actividad      a4ae7396e16ac1b76340de3ce436aec1
--   plan_inconsistencias  e5509825b1b0dc8e41b112055b607e9b

with esperado (objeto, rpc) as (values
  ('public.marcar_actividad(uuid,timestamptz,text)', true),
  ('public.desmarcar_actividad(uuid,text)',          true),
  ('public.plan_inconsistencias()',                  false)
)
select e.objeto,
       md5(replace(pg_get_functiondef(p.oid), E'\r', '')) as huella,
       coalesce(p.proconfig @> array['search_path=""'], false)
         and (p.prosecdef or not e.rpc)
         and not has_function_privilege('public', p.oid, 'execute')
         and not has_function_privilege('anon', p.oid, 'execute')
         and has_function_privilege('authenticated', p.oid, 'execute') = e.rpc as ok
  from esperado e
  join pg_proc p on p.oid = e.objeto::regprocedure
union all
select 'tabla public.plan_carga_liberada',
       null,
       (select relrowsecurity from pg_class where oid = 'public.plan_carga_liberada'::regclass)
       and has_table_privilege('authenticated', 'public.plan_carga_liberada', 'select')
       and not has_table_privilege('authenticated', 'public.plan_carga_liberada', 'insert, update, delete, truncate')
       and not has_table_privilege('anon', 'public.plan_carga_liberada', 'select, insert, update, delete, truncate')
       and not has_table_privilege('public', 'public.plan_carga_liberada', 'select, insert, update, delete, truncate')
       and (select count(*) = 1 from pg_policies
             where schemaname = 'public' and tablename = 'plan_carga_liberada'
               and roles = '{authenticated}' and cmd = 'SELECT')
order by 1;
