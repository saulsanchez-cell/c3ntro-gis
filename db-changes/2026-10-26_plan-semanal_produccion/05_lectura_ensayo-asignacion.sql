-- Que hace: ensayo de la asignacion: muestra las actividades de una UO recien asignada, su fecha propuesta y la carga reservada (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 4 filas con fecha_programada desde hoy y fecha_origen 'propuesta'; carga_reservada con dias y jornadas cuya suma = jornadas_esperadas.

-- Antes de ejecutar: reemplaza PEGAR_REFERENCIA por la referencia de la UO que
-- acabas de asignar en la app (FichaUO > GUARDAR ASIGNACION).
select u.referencia_operativa,
       a.orden,
       a.nombre                                                       as actividad,
       r.nombre                                                       as responsable,
       a.fecha_programada,
       a.fecha_origen,
       public.plan_jornadas_uo(u.id, public.plan_hoy())               as jornadas_esperadas,
       (select string_agg(c.fecha || ' ' || trim_scale(c.jornadas), ', ' order by c.fecha)
          from public.plan_carga_uo c where c.uo_id = u.id)            as carga_reservada,
       (select sum(c.jornadas) from public.plan_carga_uo c where c.uo_id = u.id) as suma_carga
  from public.unidades_operativas u
  join public.actividades_uo a on a.uo_id = u.id
  left join public.profiles r on r.id = a.responsable_id
 where u.referencia_operativa = 'PEGAR_REFERENCIA'
 order by a.ronda, a.orden;
