-- Que hace: revisa la columna nueva y SECURITY DEFINER, search_path, EXECUTE y huella de proponer_fechas_uo despues del cambio (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 1 fila con columna_date_nulos, security_definer, search_path_vacio, lee_la_columna, huella_igual y todo_listo en true; public_execute, anon_execute y authenticated_execute en false.

select exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'unidades_operativas'
                  and column_name = 'fecha_no_antes_de'
                  and data_type = 'date' and is_nullable = 'YES' and column_default is null) as columna_date_nulos,
       p.prosecdef                                                                         as security_definer,
       coalesce(p.proconfig @> array['search_path=""'], false)                             as search_path_vacio,
       has_function_privilege('public', p.oid, 'execute')                                  as public_execute,
       has_function_privilege('anon', p.oid, 'execute')                                    as anon_execute,
       has_function_privilege('authenticated', p.oid, 'execute')                           as authenticated_execute,
       p.prosrc like '%fecha_no_antes_de%'                                                 as lee_la_columna,
       md5(replace(pg_get_functiondef(p.oid), E'\r', '')) = '77bdbd410611bbd0ab7b03c86dc4ebb3' as huella_igual,
       (exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'unidades_operativas'
                   and column_name = 'fecha_no_antes_de'
                   and data_type = 'date' and is_nullable = 'YES' and column_default is null)
        and p.prosecdef
        and coalesce(p.proconfig @> array['search_path=""'], false)
        and not has_function_privilege('public', p.oid, 'execute')
        and not has_function_privilege('anon', p.oid, 'execute')
        and not has_function_privilege('authenticated', p.oid, 'execute')
        and p.prosrc like '%fecha_no_antes_de%'
        and md5(replace(pg_get_functiondef(p.oid), E'\r', '')) = '77bdbd410611bbd0ab7b03c86dc4ebb3') as todo_listo
  from pg_proc p
 where p.oid = 'public.proponer_fechas_uo(uuid,date)'::regprocedure;
