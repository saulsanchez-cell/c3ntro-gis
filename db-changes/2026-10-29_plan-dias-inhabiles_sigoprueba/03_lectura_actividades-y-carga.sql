-- Que hace: lista las actividades_uo con fecha_programada y la carga de plan_carga_uo que caen en alguna de las 7 fechas inhabiles; no se mueven solas (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf).
-- Resultado esperado: 0 filas (el 2026-10-29 no habia nada en esas fechas). Si hay filas, mandarlas completas: se mueven a mano con REPROGRAMAR en Plan semanal.
-- Corrido en SIGOprueba el 2026-10-29: resultado esperado

select 'actividad'                   as origen,
       a.fecha_programada            as fecha,
       u.referencia_operativa,
       a.orden || '. ' || a.nombre   as detalle,
       r.nombre                      as responsable,
       a.completada_en
  from public.actividades_uo a
  join public.unidades_operativas u on u.id = a.uo_id
  left join public.profiles r on r.id = a.responsable_id
 where a.fecha_programada in ('2026-11-16', '2026-12-25', '2027-01-01', '2027-02-01', '2027-03-15', '2027-09-16', '2027-11-15')
union all
select 'carga',
       c.fecha,
       u.referencia_operativa,
       trim_scale(c.jornadas) || ' jornadas',
       r.nombre,
       null
  from public.plan_carga_uo c
  join public.unidades_operativas u on u.id = c.uo_id
  left join public.profiles r on r.id = c.responsable_id
 where c.fecha in ('2026-11-16', '2026-12-25', '2027-01-01', '2027-02-01', '2027-03-15', '2027-09-16', '2027-11-15')
 order by 2, 3, 1, 4;
