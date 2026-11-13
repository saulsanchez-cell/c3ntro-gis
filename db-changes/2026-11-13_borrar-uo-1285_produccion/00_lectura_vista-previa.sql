-- Parte A. Que hace: muestra la UO 1285 completa en JSON y confirma que no tiene nada que dependa de ella (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 1 fila con dependientes = 0 y lista = true.
-- ANTES de correr 01: copiar la columna fila_json y guardarla fuera del repo (puede traer UUIDs de usuarios).
-- Es lo que necesita la reversa para volver a crear la UO.
--
-- Origen (2026-11-13): la 1285 se dio de alta como una sola UO, pero el trabajo se hizo en 1285.1 y 1285.2.
-- Revisado ese dia: Pendiente, 0 km, sin digitalizador, sin logs, historial, checklists, borradores,
-- distancia, actividades ni carga en el plan.

select u.referencia_operativa,
       u.nombre,
       u.estado,
       u.km_teoricos,
       d.dependientes,
       (u.estado = 'Pendiente' and d.dependientes = 0) as lista,
       to_jsonb(u)                                       as fila_json
  from public.unidades_operativas u
 cross join lateral (
   select (select count(*) from public.logs_actividad x       where x.uo_id = u.id)
        + (select count(*) from public.historial_estados x    where x.uo_id = u.id)
        + (select count(*) from public.checklist_resultados x where x.uo_id = u.id)
        + (select count(*) from public.checklist_borradores x where x.uo_id = u.id)
        + (select count(*) from public.log_distancia x        where x.uo_id = u.id)
        + (select count(*) from public.actividades_uo x       where x.uo_id = u.id)
        + (select count(*) from public.plan_carga_uo x        where x.uo_id = u.id) as dependientes
 ) d
 where u.referencia_operativa = '1285';
