-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- PRUEBAS de 2026-10-26_plan-semanal.sql. Solo para SIGOprueba.
--
-- Corrido en SIGOprueba (iadojhaibxpnirzijivf): 2026-10-26, resultado OK (52)
--
-- Todo corre dentro de una transacción que termina en ROLLBACK: no deja datos.
-- Simula usuarios con SET LOCAL ROLE + request.jwt.claims (auth.uid() lee "sub").
--
-- Cómo leer el resultado:
--   - Si alguna prueba falla, el script se detiene con un error "FALLO <n> ...".
--     Nada queda guardado.
--   - Si todo pasa, la última consulta devuelve "OK: todas las pruebas pasaron".
--   - En psql además se ve un NOTICE "OK <n> ..." por cada prueba, y los
--     WARNING esperados de la propuesta (UO sin método, fallo forzado).
--
-- NO SE PRUEBA la concurrencia del candado pg_advisory_xact_lock: dentro de una
-- sola transacción no hay dos asignaciones simultáneas. Para probarla hacen
-- falta dos sesiones asignando a la misma persona a la vez.
--
-- Las fechas fijas están en 2031 para no chocar con "hoy" ni con datos reales.
-- Las pruebas que dependen de "hoy" (asignación por trigger, reasignación,
-- fecha pasada) usan pg_temp.hoy(), igual a plan_hoy().
--
-- Usuarios de prueba (perfiles ficticios, sin usuario de Authentication):
--   A     e0000000-0000-4000-8000-00000000000a  digitalizador
--   B     e0000000-0000-4000-8000-00000000000b  digitalizador
--   COORD 7063db07-ed16-4ca5-8c98-53b63d128702  coordinador (UUID fijo de
--         es_coordinador(); excepción documentada en CLAUDE.md)
--   Usuario ajeno = A (no es coordinador). anon = sin sesión.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.plan_carga_uo') is null then
    raise exception 'Primero aplica 2026-10-26_plan-semanal.sql';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Ayudantes (temporales, desaparecen con la sesión)
-- -----------------------------------------------------------------------------

create function pg_temp.verificar(p_prueba text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FALLO %', p_prueba;
  end if;
  raise notice 'OK   %', p_prueba;
end $$;

-- p_sqlstate o p_mensaje (patrón LIKE) en null = no se revisa
create function pg_temp.debe_fallar_con(p_prueba text, p_sql text, p_sqlstate text, p_mensaje text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if (p_sqlstate is not null and sqlstate is distinct from p_sqlstate)
       or (p_mensaje is not null and sqlerrm not like p_mensaje) then
      raise exception 'FALLO % (fallo con otro error: % %)', p_prueba, sqlstate, sqlerrm;
    end if;
    raise notice 'OK   % -> %', p_prueba, sqlerrm;
    return;
  end;
  raise exception 'FALLO % (debia fallar y no fallo)', p_prueba;
end $$;

-- UO con sus actividades de asignación, sin pasar por el trigger y sin fechas
create function pg_temp.uo_sin_plan(p_ref text, p_metodo text, p_km numeric, p_dig uuid)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.unidades_operativas
    (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo, km_teoricos, digitalizador_id)
  values (p_ref, 'Proyecto de prueba ' || p_ref, 'Baseline', 'Pendiente', p_metodo, p_km, p_dig)
  returning id into v;
  insert into public.actividades_uo (uo_id, plantilla_id, nombre, orden, rol_responsable, responsable_id, ronda)
  select v, p.id, p.nombre, p.orden, p.rol_responsable, p_dig, 1
    from public.plantillas_actividad p
   where p.activa and p.momento_creacion = 'asignacion';
  return v;
end $$;

-- Igual, pero propone fechas desde una fecha fija
create function pg_temp.uo_planificada(p_ref text, p_metodo text, p_km numeric, p_dig uuid, p_inicio date)
returns uuid language plpgsql as $$
declare v uuid;
begin
  v := pg_temp.uo_sin_plan(p_ref, p_metodo, p_km, p_dig);
  perform public.proponer_fechas_uo(v, p_inicio);
  return v;
end $$;

create function pg_temp.uo(p_ref text)
returns uuid language sql as $$
  select id from public.unidades_operativas where referencia_operativa = p_ref
$$;

create function pg_temp.paso(p_ref text, p_orden int)
returns uuid language sql as $$
  select a.id from public.actividades_uo a
   where a.uo_id = pg_temp.uo(p_ref) and a.orden = p_orden
$$;

-- '2031-03-03:0.5,2031-03-04:1'
create function pg_temp.carga(p_ref text)
returns text language sql as $$
  select string_agg(c.fecha::text || ':' || trim_scale(c.jornadas)::text, ',' order by c.fecha)
    from public.plan_carga_uo c where c.uo_id = pg_temp.uo(p_ref)
$$;

-- '1:2031-03-03,2:2031-03-03,3:2031-03-03,4:2031-03-03'
create function pg_temp.fechas(p_ref text)
returns text language sql as $$
  select string_agg(a.orden::text || ':' || coalesce(a.fecha_programada::text, '-'), ',' order by a.orden)
    from public.actividades_uo a where a.uo_id = pg_temp.uo(p_ref)
$$;

-- Igual que public.plan_hoy(), pero ejecutable con cualquier rol simulado
-- (plan_hoy no tiene EXECUTE para authenticated ni anon)
create function pg_temp.hoy()
returns date language sql as $$
  select (now() at time zone 'America/Mexico_City')::date
$$;

-- -----------------------------------------------------------------------------
-- Datos de prueba (como postgres)
-- -----------------------------------------------------------------------------

insert into public.profiles (id, nombre, iniciales, rol) values
  ('e0000000-0000-4000-8000-00000000000a', 'Prueba Plan A', 'PA', 'digitalizador'),
  ('e0000000-0000-4000-8000-00000000000b', 'Prueba Plan B', 'PB', 'digitalizador');

insert into public.profiles (id, nombre, iniciales, rol) values
  ('7063db07-ed16-4ca5-8c98-53b63d128702', 'Prueba Coordinador', 'PC', 'coordinador')
on conflict (id) do nothing;

-- =============================================================================
-- Estructura y permisos
-- =============================================================================

select pg_temp.verificar('01 RLS activo en las 6 tablas nuevas',
  (select bool_and(c.relrowsecurity) and count(*) = 6 from pg_class c
    where c.oid in ('public.plan_rendimientos'::regclass, 'public.plan_capacidad'::regclass,
                    'public.plan_parametros'::regclass, 'public.plan_dias_inhabiles'::regclass,
                    'public.plan_integrantes'::regclass, 'public.plan_carga_uo'::regclass)));

select pg_temp.verificar('02 authenticated solo SELECT en tablas nuevas',
  (select bool_and(has_table_privilege('authenticated', t, 'select')
                   and not has_table_privilege('authenticated', t, 'insert')
                   and not has_table_privilege('authenticated', t, 'update')
                   and not has_table_privilege('authenticated', t, 'delete'))
     from unnest(array['public.plan_rendimientos', 'public.plan_capacidad', 'public.plan_parametros',
                       'public.plan_dias_inhabiles', 'public.plan_integrantes', 'public.plan_carga_uo']) t));

select pg_temp.verificar('03 anon sin SELECT en tablas nuevas',
  (select bool_and(not has_table_privilege('anon', t, 'select'))
     from unnest(array['public.plan_rendimientos', 'public.plan_capacidad', 'public.plan_parametros',
                       'public.plan_dias_inhabiles', 'public.plan_integrantes', 'public.plan_carga_uo']) t));

select pg_temp.verificar('04 search_path vacio en todas las funciones nuevas y modificadas',
  (select bool_and(proconfig @> array['search_path=""']) and count(*) = 13 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname in ('plan_hoy', 'plan_capacidad_dia', 'plan_parametro', 'plan_rendimiento',
                      'plan_jornadas_uo', 'plan_carga_persona', 'plan_sumar_dias_habiles', 'plan_dias_habiles_entre',
                      'plan_inconsistencias', 'proponer_fechas_uo', 'reprogramar_actividad',
                      'generar_actividades_uo', 'reasignar_actividades_uo')));

select pg_temp.verificar('05 sin EXECUTE para anon ni authenticated en las internas',
  (select bool_and(not has_function_privilege('anon', f, 'execute')
                   and not has_function_privilege('authenticated', f, 'execute'))
     from unnest(array['public.plan_hoy()', 'public.plan_capacidad_dia(date)',
                       'public.plan_parametro(text,date)', 'public.plan_rendimiento(text,date)',
                       'public.plan_jornadas_uo(uuid,date)', 'public.plan_carga_persona(uuid,date)', 'public.plan_sumar_dias_habiles(date,int)',
                       'public.plan_dias_habiles_entre(date,date)', 'public.plan_inconsistencias()',
                       'public.proponer_fechas_uo(uuid,date)']) f));

select pg_temp.verificar('06 reprogramar_actividad: EXECUTE para authenticated, no para anon, SECURITY DEFINER',
  has_function_privilege('authenticated', 'public.reprogramar_actividad(uuid,date,text)', 'execute')
  and not has_function_privilege('anon', 'public.reprogramar_actividad(uuid,date,text)', 'execute')
  and (select prosecdef from pg_proc where oid = 'public.reprogramar_actividad(uuid,date,text)'::regprocedure)
  and (select prosecdef from pg_proc where oid = 'public.proponer_fechas_uo(uuid,date)'::regprocedure));

select pg_temp.verificar('07 triggers tras CREATE OR REPLACE: mismos permisos (sin EXECUTE para anon ni authenticated) y SECURITY DEFINER',
  (select bool_and(not has_function_privilege('anon', f, 'execute')
                   and not has_function_privilege('authenticated', f, 'execute')
                   and (select prosecdef from pg_proc where oid = f::regprocedure))
     from unnest(array['public.generar_actividades_uo()', 'public.reasignar_actividades_uo()']) f));

-- =============================================================================
-- Parámetros y calendario
-- =============================================================================

select pg_temp.verificar('08 capacidad: lunes 1, viernes 0.75, sabado 0, domingo 0',
  public.plan_capacidad_dia('2031-03-03') = 1
  and public.plan_capacidad_dia('2031-03-07') = 0.75
  and public.plan_capacidad_dia('2031-03-08') = 0
  and public.plan_capacidad_dia('2031-03-09') = 0);

select pg_temp.verificar('09 parametros y rendimientos iniciales',
  public.plan_parametro('jornada_minima_uo', '2031-03-03') = 0.5
  and public.plan_parametro('jornadas_pasos_1_3_uo_larga', '2031-03-03') = 1.0
  and public.plan_parametro('fraccion_pasos_1_3_uo_larga', '2031-03-03') is null
  and public.plan_rendimiento('Aereo', '2031-03-03') = 30
  and public.plan_rendimiento('Subterraneo', '2031-03-03') = 17.5
  and public.plan_rendimiento('Mixto', '2031-03-03') = 5);

insert into public.plan_dias_inhabiles (fecha, descripcion) values ('2031-03-18', 'Inhabil de prueba');

select pg_temp.verificar('10 dia inhabil tiene capacidad 0',
  public.plan_capacidad_dia('2031-03-18') = 0);

select pg_temp.verificar('11 dias habiles: viernes + 1 = lunes; entre viernes y lunes = 1; hacia atras = -1',
  public.plan_sumar_dias_habiles('2031-03-07', 1) = '2031-03-10'
  and public.plan_dias_habiles_entre('2031-03-07', '2031-03-10') = 1
  and public.plan_dias_habiles_entre('2031-03-10', '2031-03-07') = -1
  and public.plan_sumar_dias_habiles('2031-03-10', -1) = '2031-03-07');

-- =============================================================================
-- Propuesta con fechas fijas (como postgres)
-- =============================================================================

-- A: lunes 2031-03-03 libre
select pg_temp.uo_planificada('PRUEBA-PLAN-A1', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000a', '2031-03-03');
select pg_temp.verificar('12 UO corta (0.5) en dia libre: todo el lunes, origen propuesta',
  pg_temp.carga('PRUEBA-PLAN-A1') = '2031-03-03:0.5'
  and pg_temp.fechas('PRUEBA-PLAN-A1') = '1:2031-03-03,2:2031-03-03,3:2031-03-03,4:2031-03-03'
  and (select bool_and(fecha_origen = 'propuesta') from public.actividades_uo where uo_id = pg_temp.uo('PRUEBA-PLAN-A1')));

select pg_temp.uo_planificada('PRUEBA-PLAN-A2', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000a', '2031-03-03');
select pg_temp.uo_planificada('PRUEBA-PLAN-A3', 'Aereo', 9,  'e0000000-0000-4000-8000-00000000000a', '2031-03-03');
select pg_temp.verificar('13 segunda UO corta cabe el lunes; la tercera (9 km -> minimo 0.5) pasa al martes',
  pg_temp.carga('PRUEBA-PLAN-A2') = '2031-03-03:0.5'
  and pg_temp.carga('PRUEBA-PLAN-A3') = '2031-03-04:0.5');

-- B: viernes 2031-03-07 (0.75)
select pg_temp.uo_planificada('PRUEBA-PLAN-B1', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000b', '2031-03-07');
select pg_temp.uo_planificada('PRUEBA-PLAN-B2', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000b', '2031-03-07');
select pg_temp.verificar('14 viernes con 0.25 libres: la UO corta de 0.5 no se parte y pasa al lunes',
  pg_temp.carga('PRUEBA-PLAN-B1') = '2031-03-07:0.5'
  and pg_temp.carga('PRUEBA-PLAN-B2') = '2031-03-10:0.5'
  and pg_temp.fechas('PRUEBA-PLAN-B2') = '1:2031-03-10,2:2031-03-10,3:2031-03-10,4:2031-03-10'
  and public.plan_carga_persona('e0000000-0000-4000-8000-00000000000b', '2031-03-07') = 0.5);

select pg_temp.uo_planificada('PRUEBA-PLAN-B3', 'Aereo', 30, 'e0000000-0000-4000-8000-00000000000b', '2031-03-14');
select pg_temp.verificar('15 UO de 1.0 jornada no cabe en viernes (0.75): va completa al lunes',
  pg_temp.carga('PRUEBA-PLAN-B3') = '2031-03-17:1');

-- Lunes 03-17 lleno, martes 03-18 inhábil
select pg_temp.uo_planificada('PRUEBA-PLAN-B4', null, 50, 'e0000000-0000-4000-8000-00000000000b', '2031-03-17');
select pg_temp.verificar('16 sin metodo constructivo: jornada minima (0.5) y salta el dia inhabil',
  pg_temp.carga('PRUEBA-PLAN-B4') = '2031-03-19:0.5');

select pg_temp.uo_planificada('PRUEBA-PLAN-B5', 'Mixto', 0, 'e0000000-0000-4000-8000-00000000000b', '2031-03-19');
select pg_temp.verificar('17 km 0: jornada minima, cabe en lo libre del miercoles',
  pg_temp.carga('PRUEBA-PLAN-B5') = '2031-03-19:0.5');

-- UO larga: 52.5 km subterráneo = 3.0 jornadas; martes 03-25 inhábil
insert into public.plan_dias_inhabiles (fecha, descripcion) values ('2031-03-25', 'Inhabil de prueba');
select pg_temp.uo_planificada('PRUEBA-PLAN-B6', 'Subterraneo', 52.5, 'e0000000-0000-4000-8000-00000000000b', '2031-03-24');
select pg_temp.verificar('18 UO larga (3.0) desde lunes libre: bloque 1-3 = 1.0 el lunes; pulido 2.0 salta el inhabil y vence el ultimo dia; suma 3.0',
  pg_temp.carga('PRUEBA-PLAN-B6') = '2031-03-24:1,2031-03-26:1,2031-03-27:1'
  and pg_temp.fechas('PRUEBA-PLAN-B6') = '1:2031-03-24,2:2031-03-24,3:2031-03-24,4:2031-03-27'
  and (select sum(jornadas) from public.plan_carga_uo where uo_id = pg_temp.uo('PRUEBA-PLAN-B6')) = 3);

-- UO larga que empieza en viernes (0.75)
select pg_temp.uo_planificada('PRUEBA-PLAN-B7', 'Subterraneo', 52.5, 'e0000000-0000-4000-8000-00000000000b', '2031-04-11');
select pg_temp.verificar('19 UO larga (3.0) desde viernes: bloque 1-3 = 0.75 viernes + 0.25 lunes y vence el lunes; pulido 2.0 martes y miercoles; suma 3.0',
  pg_temp.carga('PRUEBA-PLAN-B7') = '2031-04-11:0.75,2031-04-14:0.25,2031-04-15:1,2031-04-16:1'
  and pg_temp.fechas('PRUEBA-PLAN-B7') = '1:2031-04-14,2:2031-04-14,3:2031-04-14,4:2031-04-16'
  and (select sum(jornadas) from public.plan_carga_uo where uo_id = pg_temp.uo('PRUEBA-PLAN-B7')) = 3);

select public.proponer_fechas_uo(pg_temp.uo('PRUEBA-PLAN-B6'), '2031-03-03');
select pg_temp.verificar('20 no se recalcula: proponer otra vez no cambia nada',
  pg_temp.carga('PRUEBA-PLAN-B6') = '2031-03-24:1,2031-03-26:1,2031-03-27:1');

select pg_temp.verificar('21 consistencia: plan_inconsistencias() vacio tras proponer',
  not exists (select 1 from public.plan_inconsistencias()));

-- =============================================================================
-- Asignación real por trigger (hoy), como coordinador
-- =============================================================================

insert into public.unidades_operativas (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo, km_teoricos)
values ('PRUEBA-PLAN-T1', 'Proyecto de prueba T1', 'Baseline', 'Pendiente', 'Aereo', 15);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);

-- Igual que guardarAsignacion en FichaUO: digitalizador y estado en el mismo UPDATE
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000a', estado = 'Asignada'
 where referencia_operativa = 'PRUEBA-PLAN-T1';

select pg_temp.verificar('22 asignar genera 4 actividades con fecha desde hoy (Mexico) y carga a nombre del digitalizador',
  (select count(*) = 4 and bool_and(fecha_programada >= pg_temp.hoy() and fecha_origen = 'propuesta')
     from public.actividades_uo where uo_id = pg_temp.uo('PRUEBA-PLAN-T1'))
  and (select count(*) >= 1 and bool_and(responsable_id = 'e0000000-0000-4000-8000-00000000000a')
         from public.plan_carga_uo where uo_id = pg_temp.uo('PRUEBA-PLAN-T1')));

-- Fallo forzado: capacidad 0 en todos los días -> la propuesta falla.
-- Se deshace al final con rollback to savepoint.
reset role;
savepoint fallo_forzado;
update public.plan_capacidad set jornadas = 0;
insert into public.unidades_operativas (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo, km_teoricos)
values ('PRUEBA-PLAN-T2', 'Proyecto de prueba T2', 'Baseline', 'Pendiente', 'Aereo', 15);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);

-- Debe guardar la asignación (con un WARNING) aunque la propuesta falle
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000a', estado = 'Asignada'
 where referencia_operativa = 'PRUEBA-PLAN-T2';

select pg_temp.verificar('23 fallo forzado en la propuesta: la asignacion se guarda, actividades sin fecha, sin carga',
  (select estado = 'Asignada' from public.unidades_operativas where referencia_operativa = 'PRUEBA-PLAN-T2')
  and (select count(*) = 4 and bool_and(fecha_programada is null)
         from public.actividades_uo where uo_id = pg_temp.uo('PRUEBA-PLAN-T2'))
  and not exists (select 1 from public.plan_carga_uo where uo_id = pg_temp.uo('PRUEBA-PLAN-T2')));

reset role;
rollback to savepoint fallo_forzado;

select pg_temp.verificar('24 tras el rollback del fallo forzado la capacidad vuelve a la semilla',
  public.plan_capacidad_dia('2031-03-03') = 1 and public.plan_capacidad_dia('2031-03-07') = 0.75);

-- =============================================================================
-- Reasignación: la carga de hoy en adelante pasa al nuevo; la pasada se queda
-- =============================================================================

select pg_temp.uo_sin_plan('PRUEBA-PLAN-R1', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000a');
insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas) values
  (pg_temp.uo('PRUEBA-PLAN-R1'), pg_temp.hoy() - 2, 'e0000000-0000-4000-8000-00000000000a', 0.25),
  (pg_temp.uo('PRUEBA-PLAN-R1'), pg_temp.hoy() + 2, 'e0000000-0000-4000-8000-00000000000a', 0.25);
update public.actividades_uo
   set fecha_programada = case when orden = 4 then pg_temp.hoy() + 2 else pg_temp.hoy() - 2 end,
       fecha_origen = 'propuesta'
 where uo_id = pg_temp.uo('PRUEBA-PLAN-R1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);

update public.unidades_operativas set digitalizador_id = 'e0000000-0000-4000-8000-00000000000b'
 where referencia_operativa = 'PRUEBA-PLAN-R1';

select pg_temp.verificar('25 reasignar: carga pasada sigue con A, carga futura pasa a B, mismas fechas',
  (select responsable_id = 'e0000000-0000-4000-8000-00000000000a' from public.plan_carga_uo
    where uo_id = pg_temp.uo('PRUEBA-PLAN-R1') and fecha = pg_temp.hoy() - 2)
  and (select responsable_id = 'e0000000-0000-4000-8000-00000000000b' from public.plan_carga_uo
        where uo_id = pg_temp.uo('PRUEBA-PLAN-R1') and fecha = pg_temp.hoy() + 2)
  and (select count(*) = 2 from public.plan_carga_uo where uo_id = pg_temp.uo('PRUEBA-PLAN-R1')));

select pg_temp.verificar('26 reasignar: pendientes pasan a B y no cambian de fecha',
  (select bool_and(responsable_id = 'e0000000-0000-4000-8000-00000000000b')
     from public.actividades_uo where uo_id = pg_temp.uo('PRUEBA-PLAN-R1'))
  and pg_temp.fechas('PRUEBA-PLAN-R1') =
      '1:' || (pg_temp.hoy() - 2) || ',2:' || (pg_temp.hoy() - 2) || ',3:' || (pg_temp.hoy() - 2) || ',4:' || (pg_temp.hoy() + 2));

-- =============================================================================
-- Reprogramar (como coordinador)
-- =============================================================================

select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-B6', 4), '2031-03-31', '  El cliente movio la entrega del pulido  ');
select pg_temp.verificar('27 reprogramar el pulido (jueves -> lunes, 2 dias habiles): solo se mueve el pulido y su ultimo dia de carga',
  pg_temp.fechas('PRUEBA-PLAN-B6') = '1:2031-03-24,2:2031-03-24,3:2031-03-24,4:2031-03-31'
  and pg_temp.carga('PRUEBA-PLAN-B6') = '2031-03-24:1,2031-03-26:1,2031-03-31:1'
  and (select fecha_origen = 'ajustada' from public.actividades_uo where id = pg_temp.paso('PRUEBA-PLAN-B6', 4))
  and (select bool_and(fecha_origen = 'propuesta') from public.actividades_uo
        where uo_id = pg_temp.uo('PRUEBA-PLAN-B6') and orden < 4));

select pg_temp.verificar('28 reprogramar escribe el evento con fecha anterior, nueva, usuario y motivo',
  (select count(*) = 1
          and bool_and(evento = 'reprogramar' and fecha_anterior = '2031-03-27' and fecha_nueva = '2031-03-31'
                       and usuario_id = '7063db07-ed16-4ca5-8c98-53b63d128702'
                       and motivo = 'El cliente movio la entrega del pulido'
                       and valor_anterior is null and valor_nuevo is null)
     from public.actividades_uo_eventos where actividad_id = pg_temp.paso('PRUEBA-PLAN-B6', 4)));

select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-A1', 2), '2031-03-04', 'Falta un insumo del cliente');
select pg_temp.verificar('29 reprogramar el paso 2: se mueven 2, 3 y 4 un dia habil; el paso 1 se queda; la carga se desplaza',
  pg_temp.fechas('PRUEBA-PLAN-A1') = '1:2031-03-03,2:2031-03-04,3:2031-03-04,4:2031-03-04'
  and pg_temp.carga('PRUEBA-PLAN-A1') = '2031-03-04:0.5'
  and (select count(*) = 3 from public.actividades_uo_eventos e
         join public.actividades_uo a on a.id = e.actividad_id
        where a.uo_id = pg_temp.uo('PRUEBA-PLAN-A1') and e.evento = 'reprogramar'));

select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-B1', 1), '2031-03-10', 'Se reprograma por ausencia');
select pg_temp.verificar('30 reprogramar de viernes a lunes cuenta 1 dia habil (salta el fin de semana); se mueven los 4 pasos',
  pg_temp.fechas('PRUEBA-PLAN-B1') = '1:2031-03-10,2:2031-03-10,3:2031-03-10,4:2031-03-10'
  and pg_temp.carga('PRUEBA-PLAN-B1') = '2031-03-10:0.5'
  and (select count(*) = 4 from public.actividades_uo_eventos e
         join public.actividades_uo a on a.id = e.actividad_id
        where a.uo_id = pg_temp.uo('PRUEBA-PLAN-B1') and e.evento = 'reprogramar'));

-- plan_inconsistencias() no tiene EXECUTE para authenticated: se revisa como postgres
reset role;
select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-B7', 1), '2031-04-15', 'Insumos llegan un dia tarde');
select pg_temp.verificar('31 reprogramar el primer paso mueve toda la carga, incluido el viernes del bloque; la suma sigue en 3.0',
  pg_temp.fechas('PRUEBA-PLAN-B7') = '1:2031-04-15,2:2031-04-15,3:2031-04-15,4:2031-04-17'
  and pg_temp.carga('PRUEBA-PLAN-B7') = '2031-04-14:0.75,2031-04-15:0.25,2031-04-16:1,2031-04-17:1'
  and (select sum(jornadas) from public.plan_carga_uo where uo_id = pg_temp.uo('PRUEBA-PLAN-B7')) = 3
  and (select count(*) = 4 from public.actividades_uo_eventos e
         join public.actividades_uo a on a.id = e.actividad_id
        where a.uo_id = pg_temp.uo('PRUEBA-PLAN-B7') and e.evento = 'reprogramar'));

select pg_temp.verificar('32 consistencia: plan_inconsistencias() vacio tras reprogramar',
  not exists (select 1 from public.plan_inconsistencias()));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);

-- Validaciones
select pg_temp.debe_fallar_con('33 motivo corto',
  $q$ select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-A1', 4), '2031-03-05', 'corto') $q$,
  '22023', 'El motivo es obligatorio%');
select pg_temp.debe_fallar_con('34 fecha en sabado',
  $q$ select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-A1', 4), '2031-03-08', 'Motivo de prueba valido') $q$,
  '22023', 'La fecha no es un dia habil%');
select pg_temp.debe_fallar_con('35 fecha inhabil',
  $q$ select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-B6', 4), '2031-03-25', 'Motivo de prueba valido') $q$,
  '22023', 'La fecha no es un dia habil%');
select pg_temp.debe_fallar_con('36 fecha anterior a hoy',
  $q$ select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-A1', 4),
        date_trunc('week', pg_temp.hoy())::date - 7, 'Motivo de prueba valido') $q$,
  '22023', 'La fecha no puede ser anterior a hoy%');
select pg_temp.debe_fallar_con('37 misma fecha',
  $q$ select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-A1', 4), '2031-03-04', 'Motivo de prueba valido') $q$,
  '22023', 'La actividad ya tiene esa fecha');
select pg_temp.debe_fallar_con('38 antes del paso previo',
  $q$ select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-A1', 4), '2031-03-03', 'Motivo de prueba valido') $q$,
  '22023', 'La fecha no puede ser anterior al paso previo%');
select pg_temp.debe_fallar_con('39 actividad inexistente',
  $q$ select count(*) from public.reprogramar_actividad(gen_random_uuid(), '2031-03-05', 'Motivo de prueba valido') $q$,
  'P0002', 'Actividad no encontrada');

reset role;
select pg_temp.uo_sin_plan('PRUEBA-PLAN-A4', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000a');
update public.actividades_uo
   set completada_en = now(), completada_por = 'e0000000-0000-4000-8000-00000000000a', registrada_en = now()
 where id = pg_temp.paso('PRUEBA-PLAN-A2', 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);

select pg_temp.debe_fallar_con('40 actividad completada',
  $q$ select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-A2', 1), '2031-03-05', 'Motivo de prueba valido') $q$,
  'P0001', 'La actividad ya esta completada');
select pg_temp.debe_fallar_con('41 actividad sin fecha programada',
  $q$ select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-A4', 1), '2031-03-05', 'Motivo de prueba valido') $q$,
  'P0001', 'La actividad no tiene fecha programada');

-- =============================================================================
-- Usuario ajeno, sin sesión y anon
-- =============================================================================

select set_config('request.jwt.claims', '{"sub":"e0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select pg_temp.debe_fallar_con('42 usuario ajeno (A) no puede reprogramar',
  $q$ select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-A1', 4), '2031-03-05', 'Motivo de prueba valido') $q$,
  '42501', 'No tienes permiso para reprogramar actividades');
select pg_temp.debe_fallar_con('43 usuario ajeno no puede llamar proponer_fechas_uo',
  $q$ select public.proponer_fechas_uo(pg_temp.uo('PRUEBA-PLAN-A4'), '2031-03-03') $q$,
  '42501', null);
select pg_temp.debe_fallar_con('44 usuario ajeno no escribe fecha_programada directo',
  $q$ update public.actividades_uo set fecha_programada = '2031-03-05' where id = pg_temp.paso('PRUEBA-PLAN-A1', 4) $q$,
  '42501', null);
select pg_temp.debe_fallar_con('45 usuario ajeno no inserta carga directo',
  $q$ insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
      values (pg_temp.uo('PRUEBA-PLAN-A4'), '2031-03-05', 'e0000000-0000-4000-8000-00000000000a', 1) $q$,
  '42501', null);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select pg_temp.debe_fallar_con('46 authenticated sin sub no puede reprogramar',
  $q$ select count(*) from public.reprogramar_actividad(pg_temp.paso('PRUEBA-PLAN-A1', 4), '2031-03-05', 'Motivo de prueba valido') $q$,
  '42501', 'Sesion requerida');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pg_temp.debe_fallar_con('47 anon no ejecuta reprogramar_actividad',
  $q$ select count(*) from public.reprogramar_actividad(gen_random_uuid(), '2031-03-05', 'Motivo de prueba valido') $q$,
  '42501', null);
select pg_temp.debe_fallar_con('48 anon no lee plan_carga_uo',
  $q$ select count(*) from public.plan_carga_uo $q$,
  '42501', null);
select pg_temp.debe_fallar_con('49 anon no lee plan_integrantes',
  $q$ select count(*) from public.plan_integrantes $q$,
  '42501', null);

-- =============================================================================
-- Auditoría y consistencia final (como postgres)
-- =============================================================================

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.debe_fallar_con('50 eventos reprogramar siguen siendo de solo insercion (UPDATE como postgres)',
  $q$ update public.actividades_uo_eventos set motivo = 'alterado' where evento = 'reprogramar' $q$,
  '42501', null);

select pg_temp.verificar('51 total de eventos reprogramar = 12 (1 + 3 + 4 + 4)',
  (select count(*) = 12 from public.actividades_uo_eventos e
     join public.actividades_uo a on a.id = e.actividad_id
     join public.unidades_operativas u on u.id = a.uo_id
    where e.evento = 'reprogramar' and u.referencia_operativa like 'PRUEBA-PLAN-%'));

select pg_temp.verificar('52 consistencia final: plan_inconsistencias() vacio',
  not exists (select 1 from public.plan_inconsistencias()));

rollback;

select 'OK: todas las pruebas pasaron (52). Se hizo rollback, no quedaron datos.' as resultado;
