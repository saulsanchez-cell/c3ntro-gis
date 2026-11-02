-- Que hace: vista previa del backfill (solo lectura). Lista las UOs Asignada, En Proceso, En Correccion y En Validacion que no tienen validacion o la tienen pendiente sin fecha, y que hara 04b con cada una.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual.
-- Resultado esperado: una fila por UO. accion es una de:
--   'crea y propone'        tiene pasos, analista y fecha en el paso 4
--   'crea sin fecha: sin analista' / 'crea sin fecha: paso 4 sin fecha'
--   'se salta: sin pasos'   la UO no tiene actividades de asignacion (no se crea nada)
--   'propone (ya existia sin fecha)' / 'sigue sin fecha: ...'  la validacion ya existia (p. ej. el trigger no pudo proponer)
-- inicio_minimo es greatest(paso 4, hoy); 04b toma el primer dia desde ahi con 0.5 libres del analista.
-- Mandar todas las filas. 0 filas: no hay nada que rellenar (no hace falta 04b).
-- Corrido en SIGOprueba el 2026-11-02: 15 filas (5 crea y propone, 9 crea sin fecha: sin analista, 1 se salta: sin pasos)
-- Corrido en produccion el 2026-11-02: 30 filas (15 crea y propone, 15 se salta: sin pasos)

with uos as (
  select u.id, u.referencia_operativa, u.estado, u.analista_qa_id,
         exists (select 1 from public.actividades_uo a
                   join public.plantillas_actividad p on p.id = a.plantilla_id
                  where a.uo_id = u.id and p.momento_creacion = 'validacion') as ya_existe,
         (select (array_agg(a.fecha_programada order by a.orden desc))[1]
            from public.actividades_uo a
            join public.plantillas_actividad p on p.id = a.plantilla_id
           where a.uo_id = u.id and a.ronda = 1 and p.momento_creacion = 'asignacion') as paso4,
         exists (select 1 from public.actividades_uo a
                   join public.plantillas_actividad p on p.id = a.plantilla_id
                  where a.uo_id = u.id and a.ronda = 1 and p.momento_creacion = 'asignacion') as tiene_pasos
    from public.unidades_operativas u
   where u.estado in ('Asignada', 'En Proceso', 'En Correccion', 'En Validacion')
     and not exists (select 1 from public.actividades_uo a
                       join public.plantillas_actividad p on p.id = a.plantilla_id
                      where a.uo_id = u.id and p.momento_creacion = 'validacion'
                        and (a.fecha_programada is not null or a.completada_en is not null))
)
select s.referencia_operativa,
       s.estado,
       pr.nombre as analista_qa,
       s.paso4,
       case when s.paso4 is not null then greatest(s.paso4, public.plan_hoy()) end as inicio_minimo,
       case when s.ya_existe then
              case when s.analista_qa_id is null then 'sigue sin fecha: sin analista'
                   when s.paso4 is null          then 'sigue sin fecha: paso 4 sin fecha'
                   else 'propone (ya existia sin fecha)' end
            when not s.tiene_pasos        then 'se salta: sin pasos'
            when s.analista_qa_id is null then 'crea sin fecha: sin analista'
            when s.paso4 is null          then 'crea sin fecha: paso 4 sin fecha'
            else 'crea y propone' end as accion
  from uos s
  left join public.profiles pr on pr.id = s.analista_qa_id
 order by s.paso4 nulls last, s.referencia_operativa;
