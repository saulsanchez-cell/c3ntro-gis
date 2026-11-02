-- Que hace: comprueba que la base esta como se midio el 2026-11-02 antes del cambio (solo lectura): huellas de las 5 funciones que se reemplazan, que no existen la tabla, el parametro ni actividades de validacion, que la plantilla esta inactiva, y cuenta las UOs donde el analista QA es el mismo digitalizador.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual.
-- Resultado esperado: 1 fila con todo en true y todo_listo = true. uos_analista_igual_digitalizador no entra en todo_listo: es informativo (en produccion dio 8, todas Cerradas o Validada; el 06 es un trigger y las deja como estan).
-- Corrido en SIGOprueba el 2026-11-02: resultado esperado (todo_listo = true, uos_analista_igual_digitalizador = 0)
-- Corrido en produccion el 2026-11-02: todo_listo = true, uos_analista_igual_digitalizador = 8 (ver ../2026-11-02_plan-validacion_produccion/00b)

select h.generar_igual,
       h.reprogramar_igual,
       h.carga_persona_igual,
       h.marcar_igual,
       h.desmarcar_igual,
       e.tabla_no_existe,
       e.parametro_no_existe,
       e.plantilla_inactiva,
       e.sin_actividades_de_validacion,
       e.uos_analista_igual_digitalizador,
       h.generar_igual and h.reprogramar_igual and h.carga_persona_igual and h.marcar_igual and h.desmarcar_igual
         and e.tabla_no_existe and e.parametro_no_existe and e.plantilla_inactiva
         and e.sin_actividades_de_validacion as todo_listo
  from (select md5(replace(pg_get_functiondef('public.generar_actividades_uo()'::regprocedure), E'\r', ''))
                 = '0f2874819268a01fadb35fbb4ad6c6d3' as generar_igual,
               md5(replace(pg_get_functiondef('public.reprogramar_actividad(uuid,date,text)'::regprocedure), E'\r', ''))
                 = 'db6d767ef97245ec68883363e4bf300f' as reprogramar_igual,
               md5(replace(pg_get_functiondef('public.plan_carga_persona(uuid,date)'::regprocedure), E'\r', ''))
                 = 'a9fb0fe579ac9b8b6d97da7d2a16da9d' as carga_persona_igual,
               md5(replace(pg_get_functiondef('public.marcar_actividad(uuid,timestamptz,text)'::regprocedure), E'\r', ''))
                 = 'c057db26a154dc081337b6af97ac9b0d' as marcar_igual,
               md5(replace(pg_get_functiondef('public.desmarcar_actividad(uuid,text)'::regprocedure), E'\r', ''))
                 = '4a42e6ba2c11c2d058995daef8711b4c' as desmarcar_igual) h,
       (select to_regclass('public.plan_carga_actividad') is null as tabla_no_existe,
               not exists (select 1 from public.plan_parametros where clave = 'jornadas_validacion_uo') as parametro_no_existe,
               (select count(*) = 1 from public.plantillas_actividad
                 where nombre = 'Validación de calidad' and orden = 5
                   and momento_creacion = 'validacion' and not activa) as plantilla_inactiva,
               not exists (select 1 from public.actividades_uo a
                             join public.plantillas_actividad p on p.id = a.plantilla_id
                            where p.momento_creacion = 'validacion') as sin_actividades_de_validacion,
               (select count(*) from public.unidades_operativas
                 where analista_qa_id = digitalizador_id) as uos_analista_igual_digitalizador) e;
