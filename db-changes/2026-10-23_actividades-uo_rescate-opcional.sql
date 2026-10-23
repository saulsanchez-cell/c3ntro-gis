-- =============================================================================
-- *** PROPUESTO, NO APLICADO *** — OPCIONAL
-- Rescate: genera las actividades de 'asignacion' para UOs que ya estaban en
-- Asignada, En Proceso o En Correccion antes de 2026-10-23_actividades-uo.sql
-- y no tienen ninguna actividad.
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD  <-- completar
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD  <-- completar
--
-- created_at (límite inferior para registrar con hora anterior) = inicio del día
-- de fecha_asignacion en America/Mexico_City. Si fecha_asignacion es nula se
-- usa fecha_creacion de la UO.
--
-- Ojo: fecha_asignacion se guarda desde el frontend como fecha UTC. Si la UO se
-- asignó después de las 18:00 en México, quedó con el día siguiente y no se
-- podrán registrar horas de esa noche.
--
-- Todas quedan pendientes, con responsable = digitalizador actual de la UO.
-- Idempotente: solo toca UOs sin actividades y usa on conflict do nothing.
--
-- Para deshacer: guardar la vista previa y, antes de que alguien marque algo,
-- borrar las pendientes sin eventos de esas UOs:
--   delete from public.actividades_uo a
--    using public.unidades_operativas u
--    where u.id = a.uo_id
--      and u.referencia_operativa in ('<referencias de la vista previa>')
--      and a.completada_en is null
--      and not exists (select 1 from public.actividades_uo_eventos e where e.actividad_id = a.id);
-- =============================================================================

begin;

-- Vista previa: UOs que se van a rescatar
select u.referencia_operativa, u.estado, u.fecha_asignacion, u.digitalizador_id
  from public.unidades_operativas u
 where u.estado in ('Asignada', 'En Proceso', 'En Correccion')
   and not exists (select 1 from public.actividades_uo a where a.uo_id = u.id)
 order by u.referencia_operativa;

insert into public.actividades_uo
  (uo_id, plantilla_id, nombre, orden, rol_responsable, responsable_id, ronda, created_at)
select u.id, p.id, p.nombre, p.orden, p.rol_responsable,
       case when p.rol_responsable = 'digitalizador' then u.digitalizador_id end,
       1,
       coalesce(u.fecha_asignacion::timestamp at time zone 'America/Mexico_City', u.fecha_creacion, now())
  from public.unidades_operativas u
  join public.plantillas_actividad p
    on p.activa
   and p.momento_creacion = 'asignacion'
   and (p.tipo_proyecto is null or p.tipo_proyecto = u.tipo_proyecto)
 where u.estado in ('Asignada', 'En Proceso', 'En Correccion')
   and not exists (select 1 from public.actividades_uo a where a.uo_id = u.id)
on conflict (uo_id, plantilla_id, ronda) do nothing;

commit;
