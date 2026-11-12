-- Que hace: verifica privilegios, politicas y huellas despues del 01 (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf) y produccion (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 9 filas, todas con ok = true. Mandar las huellas (columna detalle de las funciones): se anotan en CLAUDE.md y deben salir iguales en produccion.
-- Usa has_table_privilege / has_function_privilege (no information_schema).
-- Corrido en SIGOprueba el 2026-11-12: 9 filas con ok = true; huellas plan_carga_persona 53007a90297d5d35b9718b1f966d7554
--   y plan_ausencia_persona 715a3fcc727396b1fbc11f356f9eba7b (confirmadas por MCP). Auditoria de seguridad: 0 filas.
-- Corrido en produccion el 2026-11-12: 9 filas con ok = true y las mismas huellas; auditoria de seguridad: 0 filas (reportado por Saul).

select 'plan_ausencias: RLS' as revision, null::text as detalle,
       (select relrowsecurity from pg_class where oid = 'public.plan_ausencias'::regclass) as ok
union all
select 'plan_ausencias: authenticated SELECT, INSERT, DELETE; sin UPDATE, TRUNCATE, REFERENCES ni TRIGGER', null,
       has_table_privilege('authenticated', 'public.plan_ausencias', 'select')
       and has_table_privilege('authenticated', 'public.plan_ausencias', 'insert')
       and has_table_privilege('authenticated', 'public.plan_ausencias', 'delete')
       and not has_table_privilege('authenticated', 'public.plan_ausencias', 'update, truncate, references, trigger')
union all
select 'plan_ausencias: anon y public sin nada', null,
       not has_table_privilege('anon', 'public.plan_ausencias', 'select, insert, update, delete, truncate, references, trigger')
       and not has_table_privilege('public', 'public.plan_ausencias', 'select, insert, update, delete, truncate, references, trigger')
union all
select 'plan_ausencias: politicas', string_agg(policyname || ' ' || cmd, ', ' order by policyname),
       count(*) = 3 and bool_and(cmd = 'SELECT' or coalesce(qual, '') || coalesce(with_check, '') like '%es_coordinador()%')
  from pg_policies where schemaname = 'public' and tablename = 'plan_ausencias'
union all
select 'plan_dias_inhabiles: authenticated SELECT, INSERT, DELETE; anon sin nada', null,
       has_table_privilege('authenticated', 'public.plan_dias_inhabiles', 'select, insert, delete')
       and not has_table_privilege('authenticated', 'public.plan_dias_inhabiles', 'update')
       and not has_table_privilege('anon', 'public.plan_dias_inhabiles', 'select, insert, update, delete')
union all
select 'plan_dias_inhabiles: politicas', string_agg(policyname || ' ' || cmd, ', ' order by policyname),
       count(*) = 3 and bool_and(cmd = 'SELECT' or coalesce(qual, '') || coalesce(with_check, '') like '%es_coordinador()%')
  from pg_policies where schemaname = 'public' and tablename = 'plan_dias_inhabiles'
union all
select 'huella ' || p.proname,
       md5(replace(pg_get_functiondef(p.oid), E'\r', '')),
       coalesce(p.proconfig @> array['search_path=""'], false)
       and not p.prosecdef
       and not has_function_privilege('public', p.oid, 'execute')
       and not has_function_privilege('anon', p.oid, 'execute')
       and not has_function_privilege('authenticated', p.oid, 'execute')
  from pg_proc p
 where p.oid in ('public.plan_ausencia_persona(uuid,date)'::regprocedure, 'public.plan_carga_persona(uuid,date)'::regprocedure)
union all
select 'proponer_fechas_uo y proponer_validacion_uo sin cambios', null,
       md5(replace(pg_get_functiondef('public.proponer_fechas_uo(uuid,date)'::regprocedure), E'\r', '')) = '77bdbd410611bbd0ab7b03c86dc4ebb3'
       and md5(replace(pg_get_functiondef('public.proponer_validacion_uo(uuid,date)'::regprocedure), E'\r', '')) = '46f86cfe5391feae38acb7dff95dc9be'
order by 1;
