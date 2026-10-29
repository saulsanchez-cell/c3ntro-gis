-- Que hace: muestra los pasos con fecha y la carga reservada de SEED-ACT-001 y SEED-ACT-002 (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). NUNCA en produccion.
-- Resultado esperado: 2 filas; en cada una los 4 pasos con la misma fecha (hoy o el siguiente dia habil con espacio) y una carga de 0.5 ese dia.
-- Corrido en SIGOprueba (iadojhaibxpnirzijivf) el 2026-10-26: resultado esperado.

-- C1. Fechas y carga por UO
select u.referencia_operativa,
       (select string_agg(a.orden || ':' || coalesce(a.fecha_programada::text, '-'), ', ' order by a.orden)
          from public.actividades_uo a where a.uo_id = u.id)                      as pasos,
       (select string_agg(c.fecha || ' ' || trim_scale(c.jornadas), ', ' order by c.fecha)
          from public.plan_carga_uo c where c.uo_id = u.id)                       as carga
  from public.unidades_operativas u
 where u.referencia_operativa in ('SEED-ACT-001', 'SEED-ACT-002')
 order by u.referencia_operativa;
