-- Que hace: comprueba que unidades_operativas.fecha_no_antes_de no existe y que las huellas de proponer_fechas_uo, generar_actividades_uo y reasignar_actividades_uo son las medidas el 2026-10-29 (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf).
-- Resultado esperado: 1 fila con columna_no_existe, proponer_igual, generar_igual, reasignar_igual y todo_listo en true. Si algo sale false, NO seguir: mandar la fila.
-- Corrido en SIGOprueba el 2026-10-29: resultado esperado

select c.columna_no_existe,
       h.proponer_igual,
       h.generar_igual,
       h.reasignar_igual,
       c.columna_no_existe and h.proponer_igual and h.generar_igual and h.reasignar_igual as todo_listo
  from (select not exists (select 1 from information_schema.columns
                            where table_schema = 'public' and table_name = 'unidades_operativas'
                              and column_name = 'fecha_no_antes_de') as columna_no_existe) c,
       (select md5(replace(pg_get_functiondef('public.proponer_fechas_uo(uuid,date)'::regprocedure), E'\r', ''))
                 = '5a907348c2626b4c083433688c99b686' as proponer_igual,
               md5(replace(pg_get_functiondef('public.generar_actividades_uo()'::regprocedure), E'\r', ''))
                 = '0f2874819268a01fadb35fbb4ad6c6d3' as generar_igual,
               md5(replace(pg_get_functiondef('public.reasignar_actividades_uo()'::regprocedure), E'\r', ''))
                 = '4ba2f7668eb464789c175d716f862aca' as reasignar_igual) h;
