-- Que hace: ensayo: muestra fecha_no_antes_de de la UO asignada en el preview, sus actividades con fecha y origen, y la carga reservada; antes de correrlo reemplaza PEGAR_REFERENCIA (solo lectura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 4 filas con fecha_origen 'propuesta', primer_dia_carga >= fecha_no_antes_de (o >= hoy si no se puso), cumple_no_antes_de = true y suma_carga = jornadas_esperadas.

select u.referencia_operativa,
       u.fecha_no_antes_de,
       a.orden,
       a.nombre                                                             as actividad,
       r.nombre                                                             as responsable,
       a.fecha_programada,
       a.fecha_origen,
       c.primer_dia_carga,
       c.primer_dia_carga >= greatest(public.plan_hoy(), u.fecha_no_antes_de) as cumple_no_antes_de,
       c.carga_reservada,
       c.suma_carga,
       public.plan_jornadas_uo(u.id, coalesce(c.primer_dia_carga, public.plan_hoy())) as jornadas_esperadas
  from public.unidades_operativas u
  join public.actividades_uo a on a.uo_id = u.id
  left join public.profiles r on r.id = a.responsable_id
  left join lateral (
         select min(x.fecha)                                                              as primer_dia_carga,
                string_agg(x.fecha || ' ' || trim_scale(x.jornadas), ', ' order by x.fecha) as carga_reservada,
                sum(x.jornadas)                                                           as suma_carga
           from public.plan_carga_uo x
          where x.uo_id = u.id
       ) c on true
 where u.referencia_operativa = 'PEGAR_REFERENCIA'
 order by a.ronda, a.orden;
