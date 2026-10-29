-- Que hace: muestra generar_actividades_uo y reasignar_actividades_uo de produccion y las compara con el cuerpo que guarda la reversa (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 2 filas con igual_a_la_reversa = true. Si alguna sale false, NO seguir: mandar la columna definicion completa.

-- La reversa (2026-10-26_plan-semanal_reversa.sql) guarda el cuerpo de SIGOprueba,
-- no el de produccion. huella_esperada es el md5 de ese texto tal como lo
-- devuelve pg_get_functiondef. Se quitan los CR para que los finales de linea
-- (CRLF o LF) no cuenten como diferencia.
select f.nombre,
       md5(replace(pg_get_functiondef(p.oid), chr(13), '')) as huella_produccion,
       f.huella_esperada,
       md5(replace(pg_get_functiondef(p.oid), chr(13), '')) = f.huella_esperada as igual_a_la_reversa,
       pg_get_functiondef(p.oid) as definicion
  from (values
         ('generar_actividades_uo',   '1d5e9d5dfbcd951ec8dd26c5d18c8f93'),
         ('reasignar_actividades_uo', 'd38d34edaa0d4242567b531a5b80cc00')
       ) as f(nombre, huella_esperada)
  left join pg_proc p
    on p.proname = f.nombre and p.pronamespace = 'public'::regnamespace
 order by f.nombre;
