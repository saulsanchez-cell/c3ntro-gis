-- Que hace: pruebas de la validacion planeada (25) dentro de begin ... rollback, con fechas fijas en 2031, perfiles ficticios y SET LOCAL ROLE + request.jwt.claims para actuar como coordinador o como analista; no deja datos.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Solo despues de 01. No se corre en produccion.
-- Resultado esperado: 1 fila "OK: todas las pruebas pasaron (25)". Si una falla, el script se detiene con "FALLO <n> ..." y no queda nada: mandar el mensaje completo.
-- Corrido en SIGOprueba el 2026-11-02: OK (25)
--
-- Las pruebas anteriores (52 de 2026-10-26_plan-semanal_pruebas.sql y 19 de
-- 2026-10-29_plan-inicio-asignacion) ya no pasan tal cual: las que asignan por
-- trigger esperan 4 actividades y ahora son 5 (la validacion). La prueba 04
-- de este archivo revisa que los pasos 1 a 4 y su carga salen igual que antes.
--
-- Perfiles ficticios (rol digitalizador, como en la realidad: el analista QA
-- tambien digitaliza):
--   D1 e2000000-0000-4000-8000-000000000001   D2 e2000000-0000-4000-8000-000000000002
--   A1 e2000000-0000-4000-8000-00000000000a   A2 e2000000-0000-4000-8000-00000000000b
-- Fechas: 2031-03-03 lunes, 2031-03-07 y 2031-03-14 viernes (0.75 jornadas).

begin;

do $$
begin
  if to_regclass('public.plan_carga_actividad') is null then
    raise exception 'Primero corre 01_escribe_cambio.sql';
  end if;
end $$;

create function pg_temp.verificar(p_prueba text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok is distinct from true then
    raise exception 'FALLO %', p_prueba;
  end if;
  raise notice 'OK   %', p_prueba;
end $$;

create function pg_temp.uo(p_ref text)
returns uuid language sql as $$
  select id from public.unidades_operativas where referencia_operativa = p_ref
$$;

create function pg_temp.uo_pendiente(p_ref text, p_metodo text, p_km numeric)
returns uuid language sql as $$
  insert into public.unidades_operativas (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo, km_teoricos)
  values (p_ref, 'Proyecto de prueba ' || p_ref, 'Baseline', 'Pendiente', p_metodo, p_km)
  returning id
$$;

-- Pasos 1 a 4: '1:2031-03-03,2:2031-03-03,3:2031-03-03,4:2031-03-03'
create function pg_temp.pasos(p_ref text)
returns text language sql as $$
  select string_agg(a.orden::text || ':' || coalesce(a.fecha_programada::text, '-'), ',' order by a.orden)
    from public.actividades_uo a
    join public.plantillas_actividad p on p.id = a.plantilla_id
   where a.uo_id = pg_temp.uo(p_ref) and p.momento_creacion = 'asignacion'
$$;

create function pg_temp.carga_uo(p_ref text)
returns text language sql as $$
  select string_agg(c.fecha::text || ':' || trim_scale(c.jornadas)::text, ',' order by c.fecha)
    from public.plan_carga_uo c where c.uo_id = pg_temp.uo(p_ref)
$$;

create function pg_temp.val(p_ref text)
returns public.actividades_uo language sql as $$
  select a.*
    from public.actividades_uo a
    join public.plantillas_actividad p on p.id = a.plantilla_id
   where a.uo_id = pg_temp.uo(p_ref) and p.momento_creacion = 'validacion'
$$;

-- Carga de la validacion: '2031-03-03:0.5:<responsable o ->'
create function pg_temp.carga_val(p_ref text)
returns text language sql as $$
  select string_agg(c.fecha::text || ':' || trim_scale(c.jornadas)::text || ':' || coalesce(c.responsable_id::text, '-'), ',' order by c.fecha)
    from public.plan_carga_actividad c where c.actividad_id = (pg_temp.val(p_ref)).id
$$;

create function pg_temp.hoy()
returns date language sql as $$
  select (now() at time zone 'America/Mexico_City')::date
$$;

insert into public.profiles (id, nombre, iniciales, rol) values
  ('e2000000-0000-4000-8000-000000000001', 'Prueba Val D1', 'PV1', 'digitalizador'),
  ('e2000000-0000-4000-8000-000000000002', 'Prueba Val D2', 'PV2', 'digitalizador'),
  ('e2000000-0000-4000-8000-00000000000a', 'Prueba Val A1', 'PVA', 'digitalizador'),
  ('e2000000-0000-4000-8000-00000000000b', 'Prueba Val A2', 'PVB', 'digitalizador');

insert into public.profiles (id, nombre, iniciales, rol) values
  ('7063db07-ed16-4ca5-8c98-53b63d128702', 'Prueba Coordinador', 'PC', 'coordinador')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Estructura y permisos
-- -----------------------------------------------------------------------------

select pg_temp.verificar('01 plan_carga_actividad con RLS; authenticated solo SELECT; anon y public sin nada',
  (select relrowsecurity from pg_class where oid = 'public.plan_carga_actividad'::regclass)
  and has_table_privilege('authenticated', 'public.plan_carga_actividad', 'select')
  and not has_table_privilege('authenticated', 'public.plan_carga_actividad', 'insert')
  and not has_table_privilege('authenticated', 'public.plan_carga_actividad', 'update')
  and not has_table_privilege('authenticated', 'public.plan_carga_actividad', 'delete')
  and not has_table_privilege('anon', 'public.plan_carga_actividad', 'select')
  and not has_table_privilege('public', 'public.plan_carga_actividad', 'select'));

select pg_temp.verificar('02 funciones: nuevas SECURITY DEFINER (salvo la de reglas) con search_path vacio y sin EXECUTE; las 3 RPC solo para authenticated',
  (select bool_and(coalesce(proconfig @> array['search_path=""'], false)
                   and not has_function_privilege('public', oid, 'execute')
                   and not has_function_privilege('anon', oid, 'execute')
                   and not has_function_privilege('authenticated', oid, 'execute'))
     from pg_proc
    where oid in ('public.proponer_validacion_uo(uuid,date)'::regprocedure,
                  'public.plan_inconsistencias_validacion()'::regprocedure,
                  'public.reasignar_validacion_uo()'::regprocedure,
                  'public.cerrar_validacion_uo()'::regprocedure,
                  'public.plan_carga_persona(uuid,date)'::regprocedure,
                  'public.generar_actividades_uo()'::regprocedure))
  and (select bool_and(prosecdef) from pg_proc
        where oid in ('public.proponer_validacion_uo(uuid,date)'::regprocedure,
                      'public.reasignar_validacion_uo()'::regprocedure,
                      'public.cerrar_validacion_uo()'::regprocedure))
  and (select bool_and(prosecdef
                       and coalesce(proconfig @> array['search_path=""'], false)
                       and has_function_privilege('authenticated', oid, 'execute')
                       and not has_function_privilege('anon', oid, 'execute')
                       and not has_function_privilege('public', oid, 'execute'))
         from pg_proc
        where oid in ('public.reprogramar_actividad(uuid,date,text)'::regprocedure,
                      'public.marcar_actividad(uuid,timestamptz,text)'::regprocedure,
                      'public.desmarcar_actividad(uuid,text)'::regprocedure)));

select pg_temp.verificar('03 plantilla "Validación de calidad" activa (orden 5, validacion) y jornadas_validacion_uo = 0.5 vigente',
  (select count(*) = 1 from public.plantillas_actividad
    where nombre = 'Validación de calidad' and orden = 5 and momento_creacion = 'validacion' and activa)
  and public.plan_parametro('jornadas_validacion_uo', '2031-03-03') = 0.5);

-- -----------------------------------------------------------------------------
-- Propuesta al asignar
-- -----------------------------------------------------------------------------

select pg_temp.uo_pendiente('PRUEBA-VAL-V1', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e2000000-0000-4000-8000-000000000001', analista_qa_id = 'e2000000-0000-4000-8000-00000000000a',
       estado = 'Asignada', fecha_no_antes_de = '2031-03-03'
 where referencia_operativa = 'PRUEBA-VAL-V1';
reset role;

select pg_temp.verificar('04 asignar con analista: pasos 1 a 4 y su carga igual que antes; 5 actividades; validacion del analista el mismo lunes, 0.5, propuesta',
  pg_temp.pasos('PRUEBA-VAL-V1') = '1:2031-03-03,2:2031-03-03,3:2031-03-03,4:2031-03-03'
  and pg_temp.carga_uo('PRUEBA-VAL-V1') = '2031-03-03:0.5'
  and (select count(*) = 5 from public.actividades_uo where uo_id = pg_temp.uo('PRUEBA-VAL-V1'))
  and (pg_temp.val('PRUEBA-VAL-V1')).orden = 5
  and (pg_temp.val('PRUEBA-VAL-V1')).ronda = 1
  and (pg_temp.val('PRUEBA-VAL-V1')).responsable_id = 'e2000000-0000-4000-8000-00000000000a'
  and (pg_temp.val('PRUEBA-VAL-V1')).fecha_programada = '2031-03-03'
  and (pg_temp.val('PRUEBA-VAL-V1')).fecha_origen = 'propuesta'
  and pg_temp.carga_val('PRUEBA-VAL-V1') = '2031-03-03:0.5:e2000000-0000-4000-8000-00000000000a');

-- A1 digitaliza V2 (1.0 el lunes 2031-03-10) y valida V3 ese mismo lunes
select pg_temp.uo_pendiente('PRUEBA-VAL-V2', 'Aereo', 30);
select pg_temp.uo_pendiente('PRUEBA-VAL-V3', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e2000000-0000-4000-8000-00000000000a', analista_qa_id = 'e2000000-0000-4000-8000-000000000002',
       estado = 'Asignada', fecha_no_antes_de = '2031-03-10'
 where referencia_operativa = 'PRUEBA-VAL-V2';
update public.unidades_operativas
   set digitalizador_id = 'e2000000-0000-4000-8000-000000000001', analista_qa_id = 'e2000000-0000-4000-8000-00000000000a',
       estado = 'Asignada', fecha_no_antes_de = '2031-03-10'
 where referencia_operativa = 'PRUEBA-VAL-V3';
reset role;

select pg_temp.verificar('05 capacidad compartida: el analista tiene el lunes lleno digitalizando; la validacion pasa al martes 2031-03-11',
  pg_temp.carga_uo('PRUEBA-VAL-V2') = '2031-03-10:1'
  and pg_temp.pasos('PRUEBA-VAL-V3') = '1:2031-03-10,2:2031-03-10,3:2031-03-10,4:2031-03-10'
  and (pg_temp.val('PRUEBA-VAL-V3')).fecha_programada = '2031-03-11'
  and pg_temp.carga_val('PRUEBA-VAL-V3') = '2031-03-11:0.5:e2000000-0000-4000-8000-00000000000a');

-- A1 digitaliza V4 (1.0) desde el martes, que ya tiene 0.5 de validacion
select pg_temp.uo_pendiente('PRUEBA-VAL-V4', 'Aereo', 30);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e2000000-0000-4000-8000-00000000000a', analista_qa_id = 'e2000000-0000-4000-8000-000000000002',
       estado = 'Asignada', fecha_no_antes_de = '2031-03-11'
 where referencia_operativa = 'PRUEBA-VAL-V4';
reset role;

select pg_temp.verificar('06 la validacion cuenta en la carga del analista cuando digitaliza: la UO de 1.0 no cabe el martes (0.5 libres) y va al miercoles',
  pg_temp.carga_uo('PRUEBA-VAL-V4') = '2031-03-12:1'
  and public.plan_carga_persona('e2000000-0000-4000-8000-00000000000a', '2031-03-11') = 0.5
  and (pg_temp.val('PRUEBA-VAL-V4')).fecha_programada = '2031-03-12');

-- Viernes 2031-03-14 (0.75): A2 valida V5 (0.5) y le quedan 0.25
select pg_temp.uo_pendiente('PRUEBA-VAL-V5', 'Aereo', 15);
select pg_temp.uo_pendiente('PRUEBA-VAL-V6', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e2000000-0000-4000-8000-000000000002', analista_qa_id = 'e2000000-0000-4000-8000-00000000000b',
       estado = 'Asignada', fecha_no_antes_de = '2031-03-14'
 where referencia_operativa = 'PRUEBA-VAL-V5';
update public.unidades_operativas
   set digitalizador_id = 'e2000000-0000-4000-8000-000000000001', analista_qa_id = 'e2000000-0000-4000-8000-00000000000b',
       estado = 'Asignada', fecha_no_antes_de = '2031-03-14'
 where referencia_operativa = 'PRUEBA-VAL-V6';
reset role;

select pg_temp.verificar('07 no se parte: con 0.25 libres el viernes, la segunda validacion va completa al lunes 2031-03-17',
  pg_temp.carga_val('PRUEBA-VAL-V5') = '2031-03-14:0.5:e2000000-0000-4000-8000-00000000000b'
  and pg_temp.pasos('PRUEBA-VAL-V6') = '1:2031-03-14,2:2031-03-14,3:2031-03-14,4:2031-03-14'
  and pg_temp.carga_val('PRUEBA-VAL-V6') = '2031-03-17:0.5:e2000000-0000-4000-8000-00000000000b');

-- -----------------------------------------------------------------------------
-- Analista despues de asignar, cambio y quitar
-- -----------------------------------------------------------------------------

select pg_temp.uo_pendiente('PRUEBA-VAL-V7', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e2000000-0000-4000-8000-000000000001', estado = 'Asignada', fecha_no_antes_de = '2031-03-24'
 where referencia_operativa = 'PRUEBA-VAL-V7';
reset role;

select pg_temp.verificar('08 asignar sin analista: la validacion existe sin responsable, sin fecha y sin carga; los pasos si tienen fecha',
  pg_temp.pasos('PRUEBA-VAL-V7') = '1:2031-03-24,2:2031-03-24,3:2031-03-24,4:2031-03-24'
  and (pg_temp.val('PRUEBA-VAL-V7')).id is not null
  and (pg_temp.val('PRUEBA-VAL-V7')).responsable_id is null
  and (pg_temp.val('PRUEBA-VAL-V7')).fecha_programada is null
  and pg_temp.carga_val('PRUEBA-VAL-V7') is null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas set analista_qa_id = 'e2000000-0000-4000-8000-00000000000b'
 where referencia_operativa = 'PRUEBA-VAL-V7';
reset role;

select pg_temp.verificar('09 elegir analista despues: la validacion pasa a A2 y se propone desde el paso 4',
  (pg_temp.val('PRUEBA-VAL-V7')).responsable_id = 'e2000000-0000-4000-8000-00000000000b'
  and (pg_temp.val('PRUEBA-VAL-V7')).fecha_programada = '2031-03-24'
  and pg_temp.carga_val('PRUEBA-VAL-V7') = '2031-03-24:0.5:e2000000-0000-4000-8000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas set analista_qa_id = 'e2000000-0000-4000-8000-00000000000a'
 where referencia_operativa = 'PRUEBA-VAL-V7';
reset role;

select pg_temp.verificar('10 cambiar de analista: misma fecha, la validacion y su carga pasan a A1 (no se recalcula)',
  (pg_temp.val('PRUEBA-VAL-V7')).responsable_id = 'e2000000-0000-4000-8000-00000000000a'
  and (pg_temp.val('PRUEBA-VAL-V7')).fecha_programada = '2031-03-24'
  and pg_temp.carga_val('PRUEBA-VAL-V7') = '2031-03-24:0.5:e2000000-0000-4000-8000-00000000000a');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas set analista_qa_id = null where referencia_operativa = 'PRUEBA-VAL-V7';
reset role;

select pg_temp.verificar('11a quitar el analista: la validacion y su carga quedan sin responsable, con la misma fecha',
  (pg_temp.val('PRUEBA-VAL-V7')).responsable_id is null
  and (pg_temp.val('PRUEBA-VAL-V7')).fecha_programada = '2031-03-24'
  and pg_temp.carga_val('PRUEBA-VAL-V7') = '2031-03-24:0.5:-');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas set analista_qa_id = 'e2000000-0000-4000-8000-00000000000b'
 where referencia_operativa = 'PRUEBA-VAL-V7';
reset role;

select pg_temp.verificar('11 volver a poner analista: la carga existente pasa a A2, sin duplicarse',
  (pg_temp.val('PRUEBA-VAL-V7')).responsable_id = 'e2000000-0000-4000-8000-00000000000b'
  and pg_temp.carga_val('PRUEBA-VAL-V7') = '2031-03-24:0.5:e2000000-0000-4000-8000-00000000000b');

-- -----------------------------------------------------------------------------
-- Reprogramar
-- -----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
select count(*) from public.reprogramar_actividad(
  (select a.id from public.actividades_uo a
     join public.plantillas_actividad p on p.id = a.plantilla_id
     join public.unidades_operativas u on u.id = a.uo_id
    where u.referencia_operativa = 'PRUEBA-VAL-V1' and p.momento_creacion = 'validacion'),
  '2031-03-05', 'Prueba: mover la validacion al miercoles');
reset role;

select pg_temp.verificar('12 reprogramar la validacion: solo se mueve ella y su carga; la carga y los pasos del digitalizador no cambian; 1 evento',
  (pg_temp.val('PRUEBA-VAL-V1')).fecha_programada = '2031-03-05'
  and (pg_temp.val('PRUEBA-VAL-V1')).fecha_origen = 'ajustada'
  and pg_temp.carga_val('PRUEBA-VAL-V1') = '2031-03-05:0.5:e2000000-0000-4000-8000-00000000000a'
  and pg_temp.carga_uo('PRUEBA-VAL-V1') = '2031-03-03:0.5'
  and pg_temp.pasos('PRUEBA-VAL-V1') = '1:2031-03-03,2:2031-03-03,3:2031-03-03,4:2031-03-03'
  and (select count(*) = 1 from public.actividades_uo_eventos e
        join public.actividades_uo a on a.id = e.actividad_id
       where a.uo_id = pg_temp.uo('PRUEBA-VAL-V1') and e.evento = 'reprogramar'
         and e.actividad_id = (pg_temp.val('PRUEBA-VAL-V1')).id
         and e.fecha_anterior = '2031-03-03' and e.fecha_nueva = '2031-03-05'));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.reprogramar_actividad(
      (select a.id from public.actividades_uo a
         join public.plantillas_actividad p on p.id = a.plantilla_id
         join public.unidades_operativas u on u.id = a.uo_id
        where u.referencia_operativa = 'PRUEBA-VAL-V3' and p.momento_creacion = 'validacion'),
      '2031-03-07', 'Prueba: antes del paso 4, debe fallar');
  exception when sqlstate '22023' then
    if sqlerrm like '%paso previo%' then
      raise notice 'OK   13 la validacion no se puede reprogramar antes del paso 4';
      return;
    end if;
    raise exception 'FALLO 13 error distinto: %', sqlerrm;
  end;
  raise exception 'FALLO 13 la validacion se reprogramo antes del paso 4';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
select count(*) from public.reprogramar_actividad(
  (select a.id from public.actividades_uo a
     join public.unidades_operativas u on u.id = a.uo_id
    where u.referencia_operativa = 'PRUEBA-VAL-V3' and a.orden = 4),
  '2031-03-12', 'Prueba: mover el paso 4 dos dias habiles');
reset role;

select pg_temp.verificar('14 reprogramar el paso 4 (+2 dias habiles): la validacion se recorre igual con su carga; la carga del digitalizador va al miercoles; 2 eventos',
  pg_temp.pasos('PRUEBA-VAL-V3') = '1:2031-03-10,2:2031-03-10,3:2031-03-10,4:2031-03-12'
  and pg_temp.carga_uo('PRUEBA-VAL-V3') = '2031-03-12:0.5'
  and (pg_temp.val('PRUEBA-VAL-V3')).fecha_programada = '2031-03-13'
  and pg_temp.carga_val('PRUEBA-VAL-V3') = '2031-03-13:0.5:e2000000-0000-4000-8000-00000000000a'
  and (select count(*) = 2 from public.actividades_uo_eventos e
        join public.actividades_uo a on a.id = e.actividad_id
       where a.uo_id = pg_temp.uo('PRUEBA-VAL-V3') and e.evento = 'reprogramar'));

select pg_temp.verificar('15 plan_carga_persona suma las dos tablas (A1: miercoles 1.0 de V4, jueves 0.5 de V3, lunes 1.0 de V2)',
  public.plan_carga_persona('e2000000-0000-4000-8000-00000000000a', '2031-03-12') = 1.0
  and public.plan_carga_persona('e2000000-0000-4000-8000-00000000000a', '2031-03-13') = 0.5
  and public.plan_carga_persona('e2000000-0000-4000-8000-00000000000a', '2031-03-10') = 1.0
  and public.plan_carga_persona('e2000000-0000-4000-8000-00000000000a', '2031-03-11') = 0);

select pg_temp.verificar('16 consistencia: plan_inconsistencias y plan_inconsistencias_validacion sin filas de las UOs de prueba',
  not exists (select 1 from public.plan_inconsistencias() where referencia like 'PRUEBA-VAL-%')
  and not exists (select 1 from public.plan_inconsistencias_validacion() where referencia like 'PRUEBA-VAL-%'));

-- -----------------------------------------------------------------------------
-- Marcar a mano y cierre automatico
-- -----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.marcar_actividad(
      (select a.id from public.actividades_uo a
         join public.plantillas_actividad p on p.id = a.plantilla_id
         join public.unidades_operativas u on u.id = a.uo_id
        where u.referencia_operativa = 'PRUEBA-VAL-V1' and p.momento_creacion = 'validacion'));
  exception when sqlstate 'P0001' then
    if sqlerrm like '%no se marca a mano%' then
      raise notice 'OK   17 el analista no puede marcar la validacion a mano';
      return;
    end if;
    raise exception 'FALLO 17 error distinto: %', sqlerrm;
  end;
  raise exception 'FALLO 17 la validacion se marco a mano';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select (public.marcar_actividad(
  (select a.id from public.actividades_uo a
     join public.unidades_operativas u on u.id = a.uo_id
    where u.referencia_operativa = 'PRUEBA-VAL-V1' and a.orden = 1))).id;
reset role;

select pg_temp.verificar('18 los pasos del digitalizador se siguen marcando igual',
  (select completada_en is not null and completada_por = 'e2000000-0000-4000-8000-000000000001'
     from public.actividades_uo where uo_id = pg_temp.uo('PRUEBA-VAL-V1') and orden = 1));

-- V2: la valida D2
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.unidades_operativas set estado = 'En Validacion' where referencia_operativa = 'PRUEBA-VAL-V2';
update public.unidades_operativas set estado = 'Validada'      where referencia_operativa = 'PRUEBA-VAL-V2';
reset role;

select pg_temp.verificar('19 En Validacion -> Validada: la validacion se cierra con la sesion (D2), evento marcar con motivo; los pasos no se tocan; la carga se queda',
  (pg_temp.val('PRUEBA-VAL-V2')).completada_en is not null
  and (pg_temp.val('PRUEBA-VAL-V2')).completada_por = 'e2000000-0000-4000-8000-000000000002'
  and (pg_temp.val('PRUEBA-VAL-V2')).registrada_en is not null
  and not (pg_temp.val('PRUEBA-VAL-V2')).registrada_tarde
  and (select count(*) = 1 from public.actividades_uo_eventos e
        where e.actividad_id = (pg_temp.val('PRUEBA-VAL-V2')).id and e.evento = 'marcar'
          and e.usuario_id = 'e2000000-0000-4000-8000-000000000002'
          and e.motivo = 'Cierre automatico: la UO paso a Validada')
  and (select bool_and(completada_en is null) from public.actividades_uo
        where uo_id = pg_temp.uo('PRUEBA-VAL-V2') and orden between 1 and 4)
  and pg_temp.carga_val('PRUEBA-VAL-V2') is not null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.desmarcar_actividad(
      (select a.id from public.actividades_uo a
         join public.plantillas_actividad p on p.id = a.plantilla_id
         join public.unidades_operativas u on u.id = a.uo_id
        where u.referencia_operativa = 'PRUEBA-VAL-V2' and p.momento_creacion = 'validacion'),
      'Prueba: desmarcar debe fallar');
  exception when sqlstate 'P0001' then
    if sqlerrm like '%no se desmarca%' then
      raise notice 'OK   20 la validacion cerrada no se desmarca';
      return;
    end if;
    raise exception 'FALLO 20 error distinto: %', sqlerrm;
  end;
  raise exception 'FALLO 20 la validacion se desmarco';
end $$;
reset role;

-- V4 pasa por correccion; V5 se rechaza
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.unidades_operativas set estado = 'En Validacion' where referencia_operativa = 'PRUEBA-VAL-V4';
update public.unidades_operativas set estado = 'En Correccion' where referencia_operativa = 'PRUEBA-VAL-V4';
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
update public.unidades_operativas set estado = 'En Validacion' where referencia_operativa = 'PRUEBA-VAL-V5';
update public.unidades_operativas set estado = 'Rechazada'     where referencia_operativa = 'PRUEBA-VAL-V5';
reset role;

select pg_temp.verificar('21 En Correccion y Rechazada dejan la validacion abierta, con su fecha y su carga',
  (pg_temp.val('PRUEBA-VAL-V4')).completada_en is null
  and (pg_temp.val('PRUEBA-VAL-V4')).fecha_programada = '2031-03-12'
  and (pg_temp.val('PRUEBA-VAL-V5')).completada_en is null
  and pg_temp.carga_val('PRUEBA-VAL-V5') = '2031-03-14:0.5:e2000000-0000-4000-8000-00000000000b');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.unidades_operativas set estado = 'En Validacion' where referencia_operativa = 'PRUEBA-VAL-V4';
update public.unidades_operativas set estado = 'Validada'      where referencia_operativa = 'PRUEBA-VAL-V4';
reset role;

select pg_temp.verificar('22 despues de la correccion, En Validacion -> Validada la cierra',
  (pg_temp.val('PRUEBA-VAL-V4')).completada_en is not null
  and (pg_temp.val('PRUEBA-VAL-V4')).completada_por = 'e2000000-0000-4000-8000-000000000002');

-- V6 a Validada sin sesion
select set_config('request.jwt.claims', '', true);
update public.unidades_operativas set estado = 'En Validacion' where referencia_operativa = 'PRUEBA-VAL-V6';
update public.unidades_operativas set estado = 'Validada'      where referencia_operativa = 'PRUEBA-VAL-V6';

select pg_temp.verificar('23 Validada sin sesion: la UO cambia pero la validacion queda abierta (WARNING)',
  (select estado = 'Validada' from public.unidades_operativas where referencia_operativa = 'PRUEBA-VAL-V6')
  and (pg_temp.val('PRUEBA-VAL-V6')).completada_en is null);

-- -----------------------------------------------------------------------------
-- Fallo forzado, idempotencia y check
-- -----------------------------------------------------------------------------

savepoint fallo_forzado;
update public.plan_parametros set valor = 0 where clave = 'jornadas_validacion_uo';
select pg_temp.uo_pendiente('PRUEBA-VAL-V8', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e2000000-0000-4000-8000-000000000002', analista_qa_id = 'e2000000-0000-4000-8000-00000000000a',
       estado = 'Asignada', fecha_no_antes_de = '2031-03-31'
 where referencia_operativa = 'PRUEBA-VAL-V8';
reset role;

select pg_temp.verificar('24 si la propuesta de la validacion falla, la asignacion y las fechas del digitalizador se guardan; la validacion queda sin fecha ni carga',
  (select estado = 'Asignada' from public.unidades_operativas where referencia_operativa = 'PRUEBA-VAL-V8')
  and pg_temp.pasos('PRUEBA-VAL-V8') = '1:2031-03-31,2:2031-03-31,3:2031-03-31,4:2031-03-31'
  and pg_temp.carga_uo('PRUEBA-VAL-V8') = '2031-03-31:0.5'
  and (pg_temp.val('PRUEBA-VAL-V8')).responsable_id = 'e2000000-0000-4000-8000-00000000000a'
  and (pg_temp.val('PRUEBA-VAL-V8')).fecha_programada is null
  and pg_temp.carga_val('PRUEBA-VAL-V8') is null);
rollback to savepoint fallo_forzado;

select public.proponer_validacion_uo(pg_temp.uo('PRUEBA-VAL-V1'));
select public.proponer_validacion_uo(pg_temp.uo('PRUEBA-VAL-V7'), '2031-04-07');

select pg_temp.verificar('25a proponer otra vez no hace nada (no se recalcula sola)',
  pg_temp.carga_val('PRUEBA-VAL-V1') = '2031-03-05:0.5:e2000000-0000-4000-8000-00000000000a'
  and pg_temp.carga_val('PRUEBA-VAL-V7') = '2031-03-24:0.5:e2000000-0000-4000-8000-00000000000b');

-- Check "nadie se autovalida": si el 06 no se ha corrido, se agrega aqui (el rollback lo quita).
-- NOTA 2026-11-02: esta prueba es de la primera version del 06 (un check). El 06
-- ahora es un trigger; sus pruebas estan en 06b_pruebas_rollback.sql.
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.unidades_operativas'::regclass
                    and conname = 'unidades_operativas_analista_distinto_digitalizador_check') then
    alter table public.unidades_operativas
      add constraint unidades_operativas_analista_distinto_digitalizador_check
      check (analista_qa_id <> digitalizador_id);
  end if;
end $$;

do $$
begin
  begin
    update public.unidades_operativas
       set analista_qa_id = digitalizador_id
     where referencia_operativa = 'PRUEBA-VAL-V7';
  exception when check_violation then
    raise notice 'OK   25 el analista no puede ser el digitalizador (check)';
    return;
  end;
  raise exception 'FALLO 25 se guardo analista = digitalizador';
end $$;

select 'OK: todas las pruebas pasaron (25)' as resultado;

rollback;
