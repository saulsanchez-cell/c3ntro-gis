-- =============================================================================
-- *** APLICADO EN PRODUCCIÓN ***
-- Rescate acotado: genera las actividades de 'asignacion' solo para una lista
-- fija de UOs. No reemplaza ni modifica
-- 2026-10-23_actividades-uo_rescate-opcional.sql.
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): NO PROBADO (las UOs 1282 y 1420 no existen allí)
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-10-26 (solo UOs 1282 y 1420)
--
-- Requiere: 2026-10-23_actividades-uo.sql aplicado.
--
-- Sin tablas temporales: en el SQL Editor de Supabase fallan con 42P01
-- (pasó con _seed_usuarios y con la primera versión de este archivo).
--
-- *** LA LISTA DE REFERENCIAS ESTÁ EN DOS LUGARES: PARTE A Y PARTE B. ***
-- *** SI CAMBIAS UNA, CAMBIA LA OTRA.                                  ***
--
-- Cómo correrlo:
--   1. Ejecuta SOLO la PARTE A (solo lectura) y revisa el resultado.
--   2. Si todo está bien, ejecuta SOLO la PARTE B.
--
-- PARTE B aborta sin insertar nada si alguna referencia:
--   - no existe,
--   - no está en Asignada, En Proceso o En Correccion,
--   - no tiene digitalizador_id,
--   - no tiene fecha_asignacion (sin ella created_at quedaría nulo y el
--     INSERT fallaría de todos modos, con un error menos claro).
--
-- Inserta, por UO y por plantilla activa con momento_creacion = 'asignacion':
--   created_at     = inicio del día de fecha_asignacion en America/Mexico_City
--                    (límite inferior para registrar con hora anterior)
--   responsable_id = digitalizador_id de la UO
--   ronda 1, pendientes
--
-- Ojo: fecha_asignacion se guarda desde el frontend como fecha UTC. Si la UO se
-- asignó después de las 18:00 en México, quedó con el día siguiente y no se
-- podrán registrar horas de esa noche.
--
-- Idempotente: una UO que ya tiene actividades se salta, y además se usa
-- on conflict do nothing. Volver a correr la PARTE B no duplica nada.
--
-- Para deshacer: antes de que alguien marque algo, borrar las pendientes sin
-- eventos de esas UOs:
--   delete from public.actividades_uo a
--    using public.unidades_operativas u
--    where u.id = a.uo_id
--      and u.referencia_operativa in ('1282', '1420')
--      and a.completada_en is null
--      and not exists (select 1 from public.actividades_uo_eventos e where e.actividad_id = a.id);
-- =============================================================================


-- =============================================================================
-- PARTE A: VISTA PREVIA (solo lectura). Ejecutar sola, antes de la PARTE B.
-- =============================================================================

select r.referencia,
       u.estado,
       d.nombre                                                           as digitalizador,
       u.fecha_asignacion,
       (select count(*) from public.actividades_uo a where a.uo_id = u.id) as actividades_hoy,
       case
         when u.id is null then 0
         when exists (select 1 from public.actividades_uo a where a.uo_id = u.id) then 0
         else (select count(*) from public.plantillas_actividad p
                where p.activa
                  and p.momento_creacion = 'asignacion'
                  and (p.tipo_proyecto is null or p.tipo_proyecto = u.tipo_proyecto))
       end                                                                as actividades_a_crear,
       case
         when u.id is null then 'NO EXISTE'
         when u.estado is null or u.estado not in ('Asignada', 'En Proceso', 'En Correccion') then 'ESTADO NO VALIDO'
         when u.digitalizador_id is null then 'SIN DIGITALIZADOR'
         when u.fecha_asignacion is null then 'SIN FECHA_ASIGNACION'
         else 'ok'
       end                                                                as validacion
  from (values
         -- LISTA DE REFERENCIAS (PARTE A). Cambiarla también en la PARTE B.
         ('1282'),
         ('1420')
       ) as r(referencia)
  left join public.unidades_operativas u on u.referencia_operativa = r.referencia
  left join public.profiles d on d.id = u.digitalizador_id
 order by r.referencia;


-- =============================================================================
-- PARTE B: VALIDAR E INSERTAR. Ejecutar sola, después de revisar la PARTE A.
--
-- La lista vive dentro del bloque DO (para aparecer una sola vez), que valida
-- e inserta. El SELECT final no repite la lista: muestra las actividades
-- creadas por esta misma transacción (xmin = id de la transacción actual).
-- Una UO que ya tenía actividades no aparece ahí porque no se le creó nada.
-- =============================================================================

begin;

do $$
declare
  -- LISTA DE REFERENCIAS (PARTE B). Cambiarla también en la PARTE A.
  v_refs  text[] := array['1282', '1420'];
  v_lista text;
begin
  if to_regclass('public.actividades_uo') is null then
    raise exception 'Primero aplica 2026-10-23_actividades-uo.sql';
  end if;

  select string_agg(r.referencia, ', ' order by r.referencia) into v_lista
    from unnest(v_refs) as r(referencia)
   where not exists (select 1 from public.unidades_operativas u where u.referencia_operativa = r.referencia);
  if v_lista is not null then
    raise exception 'Referencias que no existen: %', v_lista;
  end if;

  select string_agg(u.referencia_operativa || ' (' || coalesce(u.estado::text, 'sin estado') || ')', ', ' order by u.referencia_operativa) into v_lista
    from public.unidades_operativas u
   where u.referencia_operativa = any (v_refs)
     and (u.estado is null or u.estado not in ('Asignada', 'En Proceso', 'En Correccion'));
  if v_lista is not null then
    raise exception 'Referencias fuera de Asignada, En Proceso o En Correccion: %', v_lista;
  end if;

  select string_agg(u.referencia_operativa, ', ' order by u.referencia_operativa) into v_lista
    from public.unidades_operativas u
   where u.referencia_operativa = any (v_refs)
     and u.digitalizador_id is null;
  if v_lista is not null then
    raise exception 'Referencias sin digitalizador: %', v_lista;
  end if;

  select string_agg(u.referencia_operativa, ', ' order by u.referencia_operativa) into v_lista
    from public.unidades_operativas u
   where u.referencia_operativa = any (v_refs)
     and u.fecha_asignacion is null;
  if v_lista is not null then
    raise exception 'Referencias sin fecha_asignacion: %', v_lista;
  end if;

  -- Sin bloque EXCEPTION a propósito: así las filas quedan con el xmin de la
  -- transacción principal y el SELECT final las encuentra.
  insert into public.actividades_uo
    (uo_id, plantilla_id, nombre, orden, rol_responsable, responsable_id, ronda, created_at)
  select u.id, p.id, p.nombre, p.orden, p.rol_responsable,
         u.digitalizador_id,
         1,
         u.fecha_asignacion::timestamp at time zone 'America/Mexico_City'
    from public.unidades_operativas u
    join public.plantillas_actividad p
      on p.activa
     and p.momento_creacion = 'asignacion'
     and (p.tipo_proyecto is null or p.tipo_proyecto = u.tipo_proyecto)
   where u.referencia_operativa = any (v_refs)
     and not exists (select 1 from public.actividades_uo a where a.uo_id = u.id)
  on conflict (uo_id, plantilla_id, ronda) do nothing;
end $$;

-- Resultado: actividades creadas por esta transacción, por UO.
-- Sin filas = no se creó nada (todas las UOs de la lista ya tenían actividades).
select u.referencia_operativa,
       count(*)          as actividades_creadas,
       min(a.created_at) as created_at
  from public.actividades_uo a
  join public.unidades_operativas u on u.id = a.uo_id
 where a.xmin = pg_current_xact_id()::xid
 group by u.referencia_operativa
 order by u.referencia_operativa;

commit;
