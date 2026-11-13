-- Parte A. Que hace: muestra la UO 2025-SON-FED-028.1 completa en JSON y confirma que no tiene nada que dependa de ella (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 1 fila con dependientes = 0 y lista = true. Mandar estado y km_teoricos: esos km dejan de sumar en Sonora.
-- ANTES de correr 01: copiar la columna fila_json y guardarla fuera del repo (puede traer UUIDs de usuarios).
-- Es lo que necesita la reversa para volver a crear la UO.
--
-- Origen (2026-11-13): 2025-SON-FED-028.1 es una UO repetida de 2025-SON-FED-028 (mismo nombre). Saul reviso que se puede borrar.

select u.referencia_operativa,
       u.nombre,
       u.estado,
       u.km_teoricos,
       d.dependientes,
       (d.dependientes = 0)  as lista,
       to_jsonb(u)           as fila_json
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
 where u.referencia_operativa = '2025-SON-FED-028.1';
