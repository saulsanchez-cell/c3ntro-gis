-- Que hace: backfill de la validacion (escribe y hace commit). En las UOs Asignada, En Proceso, En Correccion y En Validacion con pasos y sin validacion: crea la validacion (ronda 1, responsable = analista_qa_id); despues propone la fecha de toda validacion de esos estados que tenga analista y no tenga fecha (las nuevas y las que el trigger dejo sin fecha), en orden por la fecha del paso 4 y la referencia.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual. Solo despues de revisar 04a.
-- Resultado esperado: sin filas y sin error; los NOTICE dicen cuantas se crearon y cuantas quedaron con fecha (deben coincidir con 04a). Si falla, no queda nada escrito: mandar el mensaje completo.
-- Corrido en SIGOprueba el 2026-11-02: sin error; verificado por lectura: 14 validaciones, 5 con fecha y 5 filas de carga
-- Corrido en produccion el 2026-11-02: sin error; verificado con ../2026-11-02_plan-validacion_produccion/07: 15 validaciones, 15 con fecha, 15 filas de carga

begin;

do $$
declare
  v_plantilla uuid;
  v_creadas   int;
  v_con_fecha int;
  r           record;
begin
  select p.id into strict v_plantilla
    from public.plantillas_actividad p
   where p.momento_creacion = 'validacion' and p.activa;

  with nuevas as (
    insert into public.actividades_uo (uo_id, plantilla_id, nombre, orden, rol_responsable, responsable_id, ronda)
    select u.id, p.id, p.nombre, p.orden, p.rol_responsable, u.analista_qa_id, 1
      from public.unidades_operativas u
      cross join public.plantillas_actividad p
     where p.id = v_plantilla
       and u.estado in ('Asignada', 'En Proceso', 'En Correccion', 'En Validacion')
       and exists (select 1 from public.actividades_uo a
                     join public.plantillas_actividad q on q.id = a.plantilla_id
                    where a.uo_id = u.id and a.ronda = 1 and q.momento_creacion = 'asignacion')
       and not exists (select 1 from public.actividades_uo a
                         join public.plantillas_actividad q on q.id = a.plantilla_id
                        where a.uo_id = u.id and q.momento_creacion = 'validacion')
    on conflict (uo_id, plantilla_id, ronda) do nothing
    returning uo_id
  )
  select count(*) into v_creadas from nuevas;
  raise notice 'Validaciones creadas: %', v_creadas;

  -- Propone en orden del paso 4, para repartir el espacio del analista
  v_con_fecha := 0;
  for r in
    select v.uo_id
      from public.actividades_uo v
      join public.unidades_operativas u on u.id = v.uo_id
     where v.plantilla_id = v_plantilla
       and u.estado in ('Asignada', 'En Proceso', 'En Correccion', 'En Validacion')
       and v.fecha_programada is null
       and v.completada_en is null
       and v.responsable_id is not null
     order by (select (array_agg(a.fecha_programada order by a.orden desc))[1]
                 from public.actividades_uo a
                 join public.plantillas_actividad q on q.id = a.plantilla_id
                where a.uo_id = v.uo_id and a.ronda = v.ronda and q.momento_creacion = 'asignacion') nulls last,
              u.referencia_operativa
  loop
    perform public.proponer_validacion_uo(r.uo_id);
    if exists (select 1 from public.actividades_uo v
                where v.uo_id = r.uo_id and v.plantilla_id = v_plantilla and v.fecha_programada is not null) then
      v_con_fecha := v_con_fecha + 1;
    end if;
  end loop;
  raise notice 'Validaciones con fecha propuesta: %', v_con_fecha;
end $$;

commit;
