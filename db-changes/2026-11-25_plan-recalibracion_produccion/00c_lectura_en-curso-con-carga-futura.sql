-- Que hace: lista las UOs con pasos pendientes y carga desde el 2026-11-26, y compara su carga con lo que les tocaria con los valores nuevos (solo lectura).
--   Valores nuevos propuestos: Mixto 35, Subterraneo 35 y Aereo 60 km por jornada; jornada minima 0.33.
--   No se toca nada: sirve para decidir, UO por UO, cuales se ajustan.
-- Proyecto: produccion (rtwjwfpaturmbmegwtys).
-- Resultado esperado: una fila por UO, ordenadas por persona. Mandar todas.
--   jornadas_total_actual = toda la carga reservada (pasada y futura).
--   jornadas_total_nuevo  = lo que daria la formula con los valores nuevos.
--   sobra_aprox           = carga futura que sobraria si se recalcula (0 si no sobra).
--   Si se corre otro dia, cambiar solo la fecha de corte de la CTE "corte".

with corte as (
  select date '2026-11-26' as desde
),
nuevos(metodo, km_por_jornada) as (
  values ('Mixto', 35::numeric), ('Subterraneo', 35::numeric), ('Aereo', 60::numeric)
),
pasos as (
  select a.uo_id,
         count(*)                                            as pasos,
         count(*) filter (where a.completada_en is not null) as completados
    from public.actividades_uo a
    join public.plantillas_actividad p on p.id = a.plantilla_id
   where p.momento_creacion = 'asignacion'
   group by a.uo_id
),
carga as (
  select c.uo_id,
         sum(c.jornadas)                                   as total,
         sum(c.jornadas) filter (where c.fecha <  k.desde) as ya_pasadas,
         sum(c.jornadas) filter (where c.fecha >= k.desde) as futura,
         max(c.fecha)                                       as hasta
    from public.plan_carga_uo c
   cross join corte k
   group by c.uo_id
),
calc as (
  select c.*, s.pasos, s.completados, u.referencia_operativa, u.estado, u.metodo_constructivo,
         u.km_teoricos, u.digitalizador_id,
         round(greatest(0.33, coalesce(u.km_teoricos, 0) / coalesce(n.km_por_jornada, 1e9)), 2) as total_nuevo
    from carga c
    join pasos s on s.uo_id = c.uo_id
    join public.unidades_operativas u on u.id = c.uo_id
    left join nuevos n on n.metodo = u.metodo_constructivo
   where c.futura > 0
     and s.completados < s.pasos
)
select pr.nombre                                   as persona,
       x.referencia_operativa                      as referencia,
       x.estado,
       x.metodo_constructivo                       as metodo,
       x.km_teoricos,
       x.completados || ' de ' || x.pasos          as pasos_completados,
       x.total                                     as jornadas_total_actual,
       x.total_nuevo                               as jornadas_total_nuevo,
       coalesce(x.ya_pasadas, 0)                   as jornadas_ya_pasadas,
       x.futura                                    as jornadas_futuras,
       greatest(0, x.total - x.total_nuevo)        as sobra_aprox,
       x.hasta                                     as carga_hasta
  from calc x
  left join public.profiles pr on pr.id = x.digitalizador_id
 order by 1, 2;
