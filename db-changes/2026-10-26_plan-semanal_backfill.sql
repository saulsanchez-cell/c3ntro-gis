-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- Backfill acotado del Plan semanal: propone fechas para UOs que ya tienen sus
-- actividades (creadas antes de 2026-10-26_plan-semanal.sql) pero no tienen
-- fecha ni carga reservada.
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD  <-- completar
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD  <-- completar
--
-- Requiere: 2026-10-26_plan-semanal.sql aplicado.
--
-- *** LA LISTA DE REFERENCIAS ESTÁ EN TRES LUGARES: PARTES A, B Y C. ***
-- *** SI CAMBIAS UNA, CAMBIA LAS OTRAS.                                ***
-- La lista de abajo ('1282', '1420') es la de producción. Para probar en
-- SIGOprueba, cámbiala en las tres partes por 'SEED-ACT-001', 'SEED-ACT-002'.
--
-- Cómo correrlo:
--   1. PARTE A sola (solo lectura). Revisar la columna validacion.
--   2. PARTE B sola (escribe, begin/commit).
--   3. PARTE C, cada consulta por separado (solo lectura).
--
-- Reglas:
--   - Usa la misma propuesta que el trigger (proponer_fechas_uo): empieza HOY
--     en México. Una UO que ya iba avanzada recibe fechas de hoy en adelante;
--     no aparece como atrasada por días anteriores.
--   - Se procesan en orden de fecha_asignacion (la más antigua primero), así
--     que las más antiguas toman los primeros huecos de cada persona.
--   - PARTE B aborta sin escribir si alguna referencia no existe, no está en
--     Asignada, En Proceso o En Correccion, no tiene digitalizador o no tiene
--     actividades de asignación.
--   - Idempotente: una UO que ya tiene carga reservada se salta. Volver a correr
--     la PARTE B no duplica nada.
--
-- Para deshacer, antes de que alguien reprograme algo:
--   delete from public.plan_carga_uo c using public.unidades_operativas u
--    where u.id = c.uo_id and u.referencia_operativa in ('1282', '1420');
--   update public.actividades_uo a set fecha_programada = null, fecha_origen = null
--     from public.unidades_operativas u
--    where u.id = a.uo_id and u.referencia_operativa in ('1282', '1420')
--      and a.fecha_origen = 'propuesta';
-- =============================================================================


-- =============================================================================
-- PARTE A: VISTA PREVIA (solo lectura). Ejecutar sola, antes de la PARTE B.
-- =============================================================================

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
         -- LISTA DE REFERENCIAS (PARTE A). Cambiarla también en la PARTE B.
         ('1282'),
         ('1420')
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


-- =============================================================================
-- PARTE B: VALIDAR Y PROPONER FECHAS. Ejecutar sola, después de revisar la A.
-- =============================================================================

begin;

do $$
declare
  -- LISTA DE REFERENCIAS (PARTE B). Cambiarla también en la PARTE A.
  v_refs  text[] := array['1282', '1420'];
  v_lista text;
  r       record;
begin
  if to_regclass('public.plan_carga_uo') is null then
    raise exception 'Primero aplica 2026-10-26_plan-semanal.sql';
  end if;

  select string_agg(x.referencia, ', ' order by x.referencia) into v_lista
    from unnest(v_refs) as x(referencia)
   where not exists (select 1 from public.unidades_operativas u where u.referencia_operativa = x.referencia);
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
     and not exists (select 1 from public.actividades_uo a
                       join public.plantillas_actividad p on p.id = a.plantilla_id
                      where a.uo_id = u.id and p.momento_creacion = 'asignacion');
  if v_lista is not null then
    raise exception 'Referencias sin actividades de asignacion: %', v_lista;
  end if;

  -- La más antigua primero. proponer_fechas_uo se salta las que ya tienen carga.
  for r in
    select u.id from public.unidades_operativas u
     where u.referencia_operativa = any (v_refs)
     order by u.fecha_asignacion nulls last, u.referencia_operativa
  loop
    perform public.proponer_fechas_uo(r.id);
  end loop;
end $$;

commit;


-- =============================================================================
-- PARTE C: VERIFICACIÓN (solo lectura). Cada consulta por separado.
-- La lista aparece de nuevo aquí: cambiarla igual que en A y B.
-- =============================================================================

-- C1. Fechas y carga por UO
select u.referencia_operativa,
       (select string_agg(a.orden || ':' || coalesce(a.fecha_programada::text, '-'), ', ' order by a.orden)
          from public.actividades_uo a where a.uo_id = u.id)                      as pasos,
       (select string_agg(c.fecha || ' ' || trim_scale(c.jornadas), ', ' order by c.fecha)
          from public.plan_carga_uo c where c.uo_id = u.id)                       as carga
  from public.unidades_operativas u
 where u.referencia_operativa in ('1282', '1420')
 order by u.referencia_operativa;

-- C2. Consistencia de esas UOs (sin filas = bien)
select * from public.plan_inconsistencias() where referencia in ('1282', '1420');
