-- Que hace: auditoria de seguridad del esquema public (solo lectura). Reutilizable: correrla despues de cada cambio de SQL, en SIGOprueba y en produccion.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf) y produccion (rtwjwfpaturmbmegwtys). Se corre como postgres en el SQL Editor.
-- Resultado esperado (despues de 01): solo filas con conocido = true. Hoy son 9: las politicas de escritura abiertas (USING true) de las tablas viejas, pendientes de las politicas por rol.
--   Cualquier fila con conocido = false es una regresion o algo nuevo: NO seguir y mandar la fila.
--   Cuando se cierre un hallazgo conocido, quitarlo de la lista de abajo en el mismo PR.
-- Usa has_table_privilege / has_function_privilege: information_schema solo muestra lo que ve quien consulta (asi se paso por alto anon el 2026-11-02).
-- Corrido en SIGOprueba el 2026-11-02: antes del 01, 9 conocidas y 30 nuevas; despues del 01, solo las 9 conocidas (verificado tambien por MCP). Corrido en produccion el 2026-11-02: solo las conocidas (reportado por Saul).

with conocidos (hallazgo, objeto) as (values
  -- Politicas de escritura abiertas de las tablas viejas (pendiente: politicas por rol)
  ('politica de escritura abierta (true)', 'catalogo_observaciones_qa.auth_all_catalogo'),
  ('politica de escritura abierta (true)', 'checklist_borradores.borradores_access'),
  ('politica de escritura abierta (true)', 'checklist_items.auth_all_chk_items'),
  ('politica de escritura abierta (true)', 'checklist_respuestas.auth_all_chk_resp'),
  ('politica de escritura abierta (true)', 'checklist_resultados.auth_all_chk_res'),
  ('politica de escritura abierta (true)', 'checklist_versiones.auth_all_chk_ver'),
  ('politica de escritura abierta (true)', 'historial_estados.auth_all_historial'),
  ('politica de escritura abierta (true)', 'logs_actividad.auth_all_logs'),
  ('politica de escritura abierta (true)', 'unidades_operativas.auth_all_uo')
),
rpc_esperadas (objeto) as (values
  -- SECURITY DEFINER que la app llama a proposito (validan sesion y permiso adentro)
  ('marcar_actividad(uuid,timestamp with time zone,text)'),
  ('desmarcar_actividad(uuid,text)'),
  ('ajustar_hora_actividad(uuid,timestamp with time zone,text)'),
  ('reprogramar_actividad(uuid,date,text)')
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
