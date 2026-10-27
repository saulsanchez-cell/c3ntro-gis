-- Que hace: vista previa del backfill de PRUEBA para SEED-ACT-001 y SEED-ACT-002 (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). NUNCA en produccion.
-- Resultado esperado: 2 filas, estado Asignada, actividades 4, sin_fecha 4, tiene_carga false, jornadas_a_reservar 0.5, validacion ok.
-- Corrido en SIGOprueba (iadojhaibxpnirzijivf) el 2026-10-26: resultado esperado.

select r.referencia,
       u.estado,
       d.nombre                         as digitalizador,
       u.fecha_asignacion,
       u.metodo_constructivo,
       u.km_teoricos,
       case
         when u.id is null then null
         when public.plan_rendimiento(u.metodo_constructivo, public.plan_hoy()) is null
           then public.plan_parametro('jornada_minima_uo', public.plan_hoy())
         else round(greatest(public.plan_parametro('jornada_minima_uo', public.plan_hoy()),
                             coalesce(u.km_teoricos, 0) / public.plan_rendimiento(u.metodo_constructivo, public.plan_hoy())), 2)
       end                              as jornadas_a_reservar,
       x.actividades,
       x.sin_fecha,
       x.tiene_carga,
       case
         when u.id is null then 'NO EXISTE'
         when u.estado is null or u.estado not in ('Asignada', 'En Proceso', 'En Correccion') then 'ESTADO NO VALIDO'
         when u.digitalizador_id is null then 'SIN DIGITALIZADOR'
         when x.actividades = 0 then 'SIN ACTIVIDADES'
         when x.tiene_carga then 'YA PLANEADA (se salta)'
         when u.metodo_constructivo is null then 'ok (sin metodo: jornada minima)'
         else 'ok'
       end                              as validacion
  from (values
         -- Lista de PRUEBA (SIGOprueba). La de produccion esta en 2026-10-26_plan-semanal_backfill.sql.
         ('SEED-ACT-001'),
         ('SEED-ACT-002')
       ) as r(referencia)
  left join public.unidades_operativas u on u.referencia_operativa = r.referencia
  left join public.profiles d on d.id = u.digitalizador_id
  left join lateral (
    select count(a.id) filter (where p.momento_creacion = 'asignacion')                                as actividades,
           count(a.id) filter (where p.momento_creacion = 'asignacion' and a.fecha_programada is null) as sin_fecha,
           exists (select 1 from public.plan_carga_uo c where c.uo_id = u.id)                           as tiene_carga
      from public.actividades_uo a
      join public.plantillas_actividad p on p.id = a.plantilla_id
     where a.uo_id = u.id
  ) x on true
 order by u.fecha_asignacion nulls last, r.referencia;
