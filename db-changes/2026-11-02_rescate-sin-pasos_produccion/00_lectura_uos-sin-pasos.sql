-- Que hace: lista las UOs activas (Asignada, En Proceso, En Correccion, En Validacion) que no tienen pasos de asignacion, con lo necesario para decidir el rescate (solo lectura).
-- Proyecto: produccion (rtwjwfpaturmbmegwtys). Se corre como postgres en el SQL Editor (usa plan_jornadas_uo, sin EXECUTE para authenticated).
-- Resultado esperado: 15 filas (las de 2026-11-02_plan-validacion_sigoprueba/04a con "se salta: sin pasos"). Mandar todas.
-- Corrido en produccion el 2026-11-02: 15 filas. Decision: no se rescata ninguna por ahora (ver "Pendientes conocidos" en CLAUDE.md).
--   En Validacion (8): 57, 202, 314, 315, 316, 317, 318, 543; validacion pausada por dependencias.
--   Detenidas por dependencias externas: 177 (Asignada, 40.58 jornadas), 101, 235, 433 (75.57 jornadas) y 8 (En Proceso).
--   2025-ZAC-XXX-167: sin digitalizador, analista ni metodo. 1297.2: ya validada y liberada.

select u.referencia_operativa,
       u.estado,
       u.tipo_proyecto,
       d.nombre                                            as digitalizador,
       q.nombre                                            as analista_qa,
       u.fecha_asignacion,
       u.metodo_constructivo,
       u.km_teoricos,
       public.plan_jornadas_uo(u.id, public.plan_hoy())    as jornadas,
       l.fecha                                             as ultimo_log,
       l.fase                                              as ultima_fase,
       l.porcentaje_avance                                 as ultimo_avance,
       u.es_historico,
       (select count(*) from public.actividades_uo a where a.uo_id = u.id) as actividades
  from public.unidades_operativas u
  left join public.profiles d on d.id = u.digitalizador_id
  left join public.profiles q on q.id = u.analista_qa_id
  left join lateral (
    select g.fecha, g.fase, g.porcentaje_avance
      from public.logs_actividad g
     where g.uo_id = u.id
     order by g.fecha desc
     limit 1
  ) l on true
 where u.estado in ('Asignada', 'En Proceso', 'En Correccion', 'En Validacion')
   and not exists (select 1 from public.actividades_uo a
                     join public.plantillas_actividad p on p.id = a.plantilla_id
                    where a.uo_id = u.id and a.ronda = 1 and p.momento_creacion = 'asignacion')
 order by u.estado, u.fecha_asignacion nulls first, u.referencia_operativa;
