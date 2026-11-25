-- Que hace: diagnostico (solo lectura). Lista todo lo que ocupa a Ademir del 2026-11-26 al 2026-12-11:
--   carga de UOs (digitalizador), carga de actividades (validaciones como analista) y ausencias.
-- Proyecto: produccion (rtwjwfpaturmbmegwtys).
-- Resultado esperado: una fila por dia y concepto. Mandar todas.

with persona as (
  select p.id from public.profiles p where p.nombre ilike 'Ademir%'
)
select c.fecha,
       'UO (digitalizador)' as concepto,
       u.referencia_operativa as referencia,
       u.estado::text as estado,
       null::text as actividad,
       c.jornadas
  from public.plan_carga_uo c
  join persona x on x.id = c.responsable_id
  join public.unidades_operativas u on u.id = c.uo_id
 where c.fecha between date '2026-11-26' and date '2026-12-11'
union all
select c.fecha,
       'Actividad (validacion)',
       u.referencia_operativa,
       u.estado::text,
       a.nombre || case when a.completada_en is not null then ' (completada)' else '' end,
       c.jornadas
  from public.plan_carga_actividad c
  join persona x on x.id = c.responsable_id
  join public.actividades_uo a on a.id = c.actividad_id
  join public.unidades_operativas u on u.id = a.uo_id
 where c.fecha between date '2026-11-26' and date '2026-12-11'
union all
select au.fecha,
       'Ausencia',
       null,
       null,
       au.tipo || coalesce(' - ' || au.nota, ''),
       au.fraccion
  from public.plan_ausencias au
  join persona x on x.id = au.profile_id
 where au.fecha between date '2026-11-26' and date '2026-12-11'
 order by 1, 2, 3;
