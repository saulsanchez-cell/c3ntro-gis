-- Que hace: revisa, antes del cambio, que marcar_actividad y desmarcar_actividad sean las de la validacion planeada (2026-11-02) y que plan_carga_liberada no exista (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual (ver ../2026-11-25_plan-liberar-carga_produccion/README.md).
-- Resultado esperado: 1 fila con todo_listo = true. Si sale false, no seguir y mandar la fila completa.
--   huella_plan_inconsistencias: se anota para la reversa (no hay huella previa en el repo).

select
  to_regclass('public.plan_carga_liberada') is null
    and md5(replace(pg_get_functiondef('public.marcar_actividad(uuid,timestamptz,text)'::regprocedure), E'\r', ''))
        = 'b59dca6f4cc4878d94f700cc8cccca41'
    and md5(replace(pg_get_functiondef('public.desmarcar_actividad(uuid,text)'::regprocedure), E'\r', ''))
        = '7e8e44851fd265638dd62864d28a86c8'
    as todo_listo,
  md5(replace(pg_get_functiondef('public.marcar_actividad(uuid,timestamptz,text)'::regprocedure), E'\r', ''))   as huella_marcar,
  md5(replace(pg_get_functiondef('public.desmarcar_actividad(uuid,text)'::regprocedure), E'\r', ''))            as huella_desmarcar,
  md5(replace(pg_get_functiondef('public.plan_inconsistencias()'::regprocedure), E'\r', ''))                    as huella_plan_inconsistencias;
