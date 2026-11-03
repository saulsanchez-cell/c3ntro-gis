-- Que hace: auditoria de seguridad del esquema public (solo lectura). Reutilizable: correrla despues de cada cambio de SQL, en SIGOprueba y en produccion.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf) y produccion (rtwjwfpaturmbmegwtys). Se corre como postgres en el SQL Editor.
-- Resultado esperado: 0 filas desde la fase 2 de politicas por rol (2026-11-03). Antes de la fase 2 quedaba 1 conocida (unidades_operativas.auth_all_uo); antes de la fase 1, 9.
--   Cualquier fila con conocido = false es una regresion o algo nuevo: NO seguir y mandar la fila.
--   Cuando se cierre un hallazgo conocido, quitarlo de la lista de abajo en el mismo PR.
-- Usa has_table_privilege / has_function_privilege: information_schema solo muestra lo que ve quien consulta (asi se paso por alto anon el 2026-11-02).
-- Corrido en SIGOprueba el 2026-11-02: antes del 01, 9 conocidas y 30 nuevas; despues del 01, solo las 9 conocidas (verificado tambien por MCP). Corrido en produccion el 2026-11-02: solo las conocidas (reportado por Saul).
-- Corrido despues de la fase 1 (2026-11-03), en SIGOprueba y produccion: solo auth_all_uo (es_coordinador() se agrego a rpc_esperadas).
-- Corrido despues de la fase 2 (2026-11-03), en SIGOprueba y produccion: 0 filas.

with conocidos (hallazgo, objeto) as (
  -- Sin hallazgos conocidos desde la fase 2 de politicas por rol (2026-11-03):
  -- las 9 politicas de escritura abiertas se cerraron en las fases 1 y 2.
  -- Si hace falta aceptar uno, agregarlo aqui: select 'hallazgo'::text, 'objeto'::text union all ...
  select null::text as hallazgo, null::text as objeto where false
),
rpc_esperadas (objeto) as (values
  -- SECURITY DEFINER que la app llama a proposito (validan sesion y permiso adentro)
  ('marcar_actividad(uuid,timestamp with time zone,text)'),
  ('desmarcar_actividad(uuid,text)'),
  ('ajustar_hora_actividad(uuid,timestamp with time zone,text)'),
  ('reprogramar_actividad(uuid,date,text)'),
  -- Desde la fase 1 de politicas por rol: las politicas la llaman con la sesion
  -- de cada usuario y lee profiles sin pasar por su RLS
  ('es_coordinador()')
),
hallazgos (hallazgo, objeto, detalle) as (
  select 'tabla sin RLS', c.relname::text, null::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  union all
  select 'anon o public con privilegio en tabla', c.relname::text, r.rol
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('public')) as r(rol)
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
     and case when c.relkind in ('r', 'p', 'v', 'm')
              then has_table_privilege(r.rol, c.oid, 'select, insert, update, delete, truncate, references, trigger') else false end
  union all
  select 'authenticated con TRUNCATE, REFERENCES o TRIGGER', c.relname::text, null
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
     and case when c.relkind in ('r', 'p')
              then has_table_privilege('authenticated', c.oid, 'truncate, references, trigger') else false end
  union all
  select 'secuencia usable por anon', c.relname::text, null
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'S'
     -- CASE: el planificador podria evaluar la funcion antes del filtro de relkind
     and case when c.relkind = 'S' then has_sequence_privilege('anon', c.oid, 'usage, select, update') else false end
  union all
  select 'politica para public o anon', p.tablename || '.' || p.policyname, p.cmd || ' roles=' || p.roles::text
    from pg_policies p
   where p.schemaname = 'public' and p.roles && array['public', 'anon']::name[]
  union all
  select 'politica de escritura abierta (true)', p.tablename || '.' || p.policyname, p.cmd || ' roles=' || p.roles::text
    from pg_policies p
   where p.schemaname = 'public' and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and coalesce(p.qual, 'true') = 'true' and coalesce(p.with_check, 'true') = 'true'
  union all
  select 'funcion ejecutable por anon o public', p.oid::regprocedure::text, r.rol
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join (values ('anon'), ('public')) as r(rol)
   where n.nspname = 'public' and has_function_privilege(r.rol, p.oid, 'execute')
  union all
  select 'SECURITY DEFINER sin search_path vacio', p.oid::regprocedure::text, null
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not coalesce(p.proconfig @> array['search_path=""'], false)
  union all
  select 'SECURITY DEFINER ejecutable por authenticated', replace(p.oid::regprocedure::text, 'public.', ''), null
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'execute')
  union all
  select 'profiles: escritura sin es_coordinador()', p.policyname, p.cmd
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'profiles' and p.cmd <> 'SELECT'
     and coalesce(p.qual, '') not like '%es_coordinador()%'
     and coalesce(p.with_check, '') not like '%es_coordinador()%'
)
select h.hallazgo,
       h.objeto,
       h.detalle,
       exists (select 1 from conocidos k where k.hallazgo = h.hallazgo and k.objeto = h.objeto)
         or (h.hallazgo = 'SECURITY DEFINER ejecutable por authenticated'
             and exists (select 1 from rpc_esperadas e where e.objeto = h.objeto)) as conocido
  from hallazgos h
 -- Las RPC esperadas no son un hallazgo: solo se listan si aparece una nueva
 where not (h.hallazgo = 'SECURITY DEFINER ejecutable por authenticated'
            and exists (select 1 from rpc_esperadas e where e.objeto = h.objeto))
 order by 4, 1, 2;
