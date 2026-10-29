-- Que hace: comprueba que el plan semanal todavia no existe: las 6 tablas plan_* y la columna actividades_uo.fecha_programada (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 1 fila con las 6 tablas en null, fecha_programada_existe = false y todo_listo = true.

select to_regclass('public.plan_rendimientos')   as plan_rendimientos,
       to_regclass('public.plan_capacidad')      as plan_capacidad,
       to_regclass('public.plan_parametros')     as plan_parametros,
       to_regclass('public.plan_dias_inhabiles') as plan_dias_inhabiles,
       to_regclass('public.plan_integrantes')    as plan_integrantes,
       to_regclass('public.plan_carga_uo')       as plan_carga_uo,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'actividades_uo'
                  and column_name = 'fecha_programada') as fecha_programada_existe,
       (to_regclass('public.plan_rendimientos') is null
        and to_regclass('public.plan_capacidad') is null
        and to_regclass('public.plan_parametros') is null
        and to_regclass('public.plan_dias_inhabiles') is null
        and to_regclass('public.plan_integrantes') is null
        and to_regclass('public.plan_carga_uo') is null
        and not exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'actividades_uo'
                           and column_name = 'fecha_programada')) as todo_listo;
