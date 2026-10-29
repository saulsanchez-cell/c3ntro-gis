-- Que hace: revisa RLS y permisos de las 6 tablas plan_* (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 6 filas con rls = true, authenticated_select = true y todo lo demas false.

select t.tabla,
       c.relrowsecurity                                          as rls,
       has_table_privilege('anon', c.oid, 'select')              as anon_select,
       has_table_privilege('authenticated', c.oid, 'select')     as authenticated_select,
       has_table_privilege('authenticated', c.oid, 'insert')     as authenticated_insert,
       has_table_privilege('authenticated', c.oid, 'update')     as authenticated_update,
       has_table_privilege('authenticated', c.oid, 'delete')     as authenticated_delete
  from (values ('plan_rendimientos'), ('plan_capacidad'), ('plan_parametros'),
               ('plan_dias_inhabiles'), ('plan_integrantes'), ('plan_carga_uo')) as t(tabla)
  left join pg_class c on c.oid = to_regclass('public.' || t.tabla)
 order by t.tabla;
