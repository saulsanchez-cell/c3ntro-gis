-- Que hace: lista las UOs con todos sus pasos completados que todavia reservan carga desde el 2026-11-26 (solo lectura).
--   Es la carga que hace ver ocupado a alguien que ya termino. No incluye la carga de la validacion
--   (plan_carga_actividad): esa es del analista y sigue pendiente mientras la UO no se valide.
-- Proyecto: produccion (rtwjwfpaturmbmegwtys).
-- Resultado esperado: una fila por UO, ordenadas por persona. Mandar todas.
--   jornadas_a_liberar = lo que se quitaria (carga desde el 2026-11-26).
--   jornadas_ya_pasadas = carga hasta hoy; no se toca.
--   Si se corre otro dia, cambiar solo la fecha de corte de la CTE "corte".

with corte as (
  select date '2026-11-26' as desde
),
pasos as (
  select a.uo_id,
         count(*)                                         as pasos,
         count(*) filter (where a.completada_en is not null) as completados,
         max(a.completada_en)                             as ultimo_completado
    from public.actividades_uo a
    join public.plantillas_actividad p on p.id = a.plantilla_id
   where p.momento_creacion = 'asignacion'
   group by a.uo_id
),
carga as (
  select c.uo_id,
         sum(c.jornadas) filter (where c.fecha <  k.desde) as ya_pasadas,
         sum(c.jornadas) filter (where c.fecha >= k.desde) as a_liberar,
         min(c.fecha)    filter (where c.fecha >= k.desde) as desde,
         max(c.fecha)                                       as hasta
    from public.plan_carga_uo c
   cross join corte k
   group by c.uo_id
)
select pr.nombre                                   as persona,
       u.referencia_operativa                      as referencia,
       u.estado,
       u.metodo_constructivo                       as metodo,
       u.km_teoricos,
       (s.ultimo_completado at time zone 'America/Mexico_City')::date as pasos_terminados_el,
       coalesce(c.ya_pasadas, 0)                   as jornadas_ya_pasadas,
       c.a_liberar                                 as jornadas_a_liberar,
       c.desde                                     as carga_futura_desde,
       c.hasta                                     as carga_futura_hasta
  from carga c
  join pasos s on s.uo_id = c.uo_id
  join public.unidades_operativas u on u.id = c.uo_id
  left join public.profiles pr on pr.id = u.digitalizador_id
 where c.a_liberar > 0
   and s.pasos > 0
   and s.completados = s.pasos
 order by 1, 2;
