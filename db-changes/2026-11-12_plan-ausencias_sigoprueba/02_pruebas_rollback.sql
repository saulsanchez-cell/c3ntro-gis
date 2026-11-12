-- Que hace: pruebas de las ausencias por persona y de los feriados desde la app (16) dentro de begin ... rollback, con fechas fijas en 2031, perfiles ficticios y SET LOCAL ROLE + request.jwt.claims; no deja datos.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Solo despues de 01. No se corre en produccion.
-- Resultado esperado: 1 fila "OK: todas las pruebas pasaron (16)". Si una falla, el script se detiene con "FALLO <n> ..." y no queda nada: mandar el mensaje completo.
-- Corrido en SIGOprueba el 2026-11-12: OK (16), segun Saul.
--
-- Perfiles ficticios (rol digitalizador, como en la realidad):
--   D1 e7000000-0000-4000-8000-000000000001   D2 e7000000-0000-4000-8000-000000000002
--   A1 e7000000-0000-4000-8000-00000000000a   (analista QA)
--   Coordinador: el UUID fijo del coordinador (documentado en CLAUDE.md).
-- Fechas: 2031-03-03 lunes ... 2031-03-07 viernes (0.75 jornadas); 2031-03-10 lunes; 2031-03-17 lunes.
-- Aereo: 30 km por jornada (minimo 0.5): 15 km = 0.5, 30 km = 1.0, 75 km = 2.5.

begin;

do $$
begin
  if to_regclass('public.plan_ausencias') is null then
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

create function pg_temp.val_fecha(p_ref text)
returns date language sql as $$
  select a.fecha_programada
    from public.actividades_uo a
    join public.plantillas_actividad p on p.id = a.plantilla_id
   where a.uo_id = pg_temp.uo(p_ref) and p.momento_creacion = 'validacion'
$$;

insert into public.profiles (id, nombre, iniciales, rol) values
  ('e7000000-0000-4000-8000-000000000001', 'Prueba Aus D1', 'PA1', 'digitalizador'),
  ('e7000000-0000-4000-8000-000000000002', 'Prueba Aus D2', 'PA2', 'digitalizador'),
  ('e7000000-0000-4000-8000-00000000000a', 'Prueba Aus A1', 'PAA', 'digitalizador');

insert into public.profiles (id, nombre, iniciales, rol) values
  ('7063db07-ed16-4ca5-8c98-53b63d128702', 'Prueba Coordinador', 'PC', 'coordinador')
on conflict (id) do nothing;

-- Asigna como coordinador (el trigger genera los pasos y propone las fechas)
create function pg_temp.asignar(p_ref text, p_dig uuid, p_qa uuid, p_desde date)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
  update public.unidades_operativas
     set digitalizador_id = p_dig, analista_qa_id = p_qa, estado = 'Asignada', fecha_no_antes_de = p_desde
   where referencia_operativa = p_ref;
  perform set_config('role', 'none', true);  -- igual que RESET ROLE
end $$;

-- -----------------------------------------------------------------------------
-- Estructura y permisos
-- -----------------------------------------------------------------------------

select pg_temp.verificar('01 plan_ausencias con RLS; authenticated SELECT, INSERT y DELETE (sin UPDATE); anon y public sin nada; 3 politicas con es_coordinador() para escribir',
  (select relrowsecurity from pg_class where oid = 'public.plan_ausencias'::regclass)
  and has_table_privilege('authenticated', 'public.plan_ausencias', 'select')
  and has_table_privilege('authenticated', 'public.plan_ausencias', 'insert')
  and has_table_privilege('authenticated', 'public.plan_ausencias', 'delete')
  and not has_table_privilege('authenticated', 'public.plan_ausencias', 'update')
  and not has_table_privilege('authenticated', 'public.plan_ausencias', 'truncate, references, trigger')
  and not has_table_privilege('anon', 'public.plan_ausencias', 'select, insert, update, delete, truncate, references, trigger')
  and not has_table_privilege('public', 'public.plan_ausencias', 'select, insert, update, delete, truncate, references, trigger')
  and (select array_agg(policyname::text order by policyname) from pg_policies
        where schemaname = 'public' and tablename = 'plan_ausencias')
      = array['plan_ausencias_delete', 'plan_ausencias_insert', 'plan_ausencias_select']
  and (select bool_and(coalesce(qual, '') || coalesce(with_check, '') like '%es_coordinador()%') from pg_policies
        where schemaname = 'public' and tablename = 'plan_ausencias' and cmd <> 'SELECT'));

select pg_temp.verificar('02 plan_dias_inhabiles: authenticated SELECT, INSERT y DELETE (sin UPDATE); escribir solo con es_coordinador(); anon sin nada',
  has_table_privilege('authenticated', 'public.plan_dias_inhabiles', 'select')
  and has_table_privilege('authenticated', 'public.plan_dias_inhabiles', 'insert')
  and has_table_privilege('authenticated', 'public.plan_dias_inhabiles', 'delete')
  and not has_table_privilege('authenticated', 'public.plan_dias_inhabiles', 'update')
  and not has_table_privilege('anon', 'public.plan_dias_inhabiles', 'select, insert, update, delete')
  and (select array_agg(policyname::text order by policyname) from pg_policies
        where schemaname = 'public' and tablename = 'plan_dias_inhabiles')
      = array['plan_dias_inhabiles_delete', 'plan_dias_inhabiles_insert', 'plan_dias_inhabiles_select']
  and (select bool_and(coalesce(qual, '') || coalesce(with_check, '') like '%es_coordinador()%') from pg_policies
        where schemaname = 'public' and tablename = 'plan_dias_inhabiles' and cmd <> 'SELECT'));

select pg_temp.verificar('03 plan_ausencia_persona y plan_carga_persona: search_path vacio, no SECURITY DEFINER, sin EXECUTE para public, anon ni authenticated; proponer_* sin cambios',
  (select bool_and(coalesce(proconfig @> array['search_path=""'], false)
                   and not prosecdef
                   and not has_function_privilege('public', oid, 'execute')
                   and not has_function_privilege('anon', oid, 'execute')
                   and not has_function_privilege('authenticated', oid, 'execute'))
     from pg_proc
    where oid in ('public.plan_ausencia_persona(uuid,date)'::regprocedure,
                  'public.plan_carga_persona(uuid,date)'::regprocedure))
  and md5(replace(pg_get_functiondef('public.proponer_fechas_uo(uuid,date)'::regprocedure), E'\r', '')) = '77bdbd410611bbd0ab7b03c86dc4ebb3'
  and md5(replace(pg_get_functiondef('public.proponer_validacion_uo(uuid,date)'::regprocedure), E'\r', '')) = '46f86cfe5391feae38acb7dff95dc9be');

-- -----------------------------------------------------------------------------
-- Capacidad
-- -----------------------------------------------------------------------------

insert into public.plan_ausencias (profile_id, fecha, fraccion, tipo) values
  ('e7000000-0000-4000-8000-000000000001', '2031-03-03', 1,   'Vacaciones'),  -- D1 lunes completo
  ('e7000000-0000-4000-8000-000000000001', '2031-03-05', 0.5, 'Permiso'),     -- D1 miercoles medio dia
  ('e7000000-0000-4000-8000-000000000001', '2031-03-07', 0.5, 'Permiso'),     -- D1 viernes medio dia
  ('e7000000-0000-4000-8000-00000000000a', '2031-03-10', 1,   'Vacaciones'),  -- A1 lunes completo
  ('e7000000-0000-4000-8000-000000000002', '2031-03-18', 1,   'Vacaciones');  -- D2 martes completo

select pg_temp.verificar('04 plan_carga_persona: dia completo = capacidad del dia (1); medio dia = la mitad (0.5; viernes 0.375); sin ausencia = 0; otra persona = 0',
  public.plan_carga_persona('e7000000-0000-4000-8000-000000000001', '2031-03-03') = 1
  and public.plan_carga_persona('e7000000-0000-4000-8000-000000000001', '2031-03-05') = 0.5
  and public.plan_carga_persona('e7000000-0000-4000-8000-000000000001', '2031-03-07') = 0.375
  and public.plan_carga_persona('e7000000-0000-4000-8000-000000000001', '2031-03-04') = 0
  and public.plan_carga_persona('e7000000-0000-4000-8000-000000000002', '2031-03-03') = 0
  and public.plan_ausencia_persona('e7000000-0000-4000-8000-000000000001', '2031-03-03') = 1);

-- -----------------------------------------------------------------------------
-- Propuesta de fechas al asignar
-- -----------------------------------------------------------------------------

select pg_temp.uo_pendiente('PRUEBA-AUS-1', 'Aereo', 15);
select pg_temp.asignar('PRUEBA-AUS-1', 'e7000000-0000-4000-8000-000000000001', null, '2031-03-03');

select pg_temp.verificar('05 vacaciones del digitalizador: la UO de 0.5 desde el lunes 2031-03-03 (D1 de vacaciones) va al martes 2031-03-04',
  pg_temp.pasos('PRUEBA-AUS-1') = '1:2031-03-04,2:2031-03-04,3:2031-03-04,4:2031-03-04'
  and pg_temp.carga_uo('PRUEBA-AUS-1') = '2031-03-04:0.5');

select pg_temp.uo_pendiente('PRUEBA-AUS-2', 'Aereo', 15);
select pg_temp.asignar('PRUEBA-AUS-2', 'e7000000-0000-4000-8000-000000000002', null, '2031-03-03');

select pg_temp.verificar('06 las vacaciones de D1 no afectan a D2: su UO queda el lunes 2031-03-03',
  pg_temp.pasos('PRUEBA-AUS-2') = '1:2031-03-03,2:2031-03-03,3:2031-03-03,4:2031-03-03'
  and pg_temp.carga_uo('PRUEBA-AUS-2') = '2031-03-03:0.5');

select pg_temp.uo_pendiente('PRUEBA-AUS-3', 'Aereo', 15);
select pg_temp.asignar('PRUEBA-AUS-3', 'e7000000-0000-4000-8000-000000000001', null, '2031-03-05');

select pg_temp.verificar('07 medio dia: una UO de 0.5 cabe el miercoles 2031-03-05 en la mitad libre de D1',
  pg_temp.carga_uo('PRUEBA-AUS-3') = '2031-03-05:0.5');

select pg_temp.uo_pendiente('PRUEBA-AUS-4', 'Aereo', 30);
select pg_temp.asignar('PRUEBA-AUS-4', 'e7000000-0000-4000-8000-000000000001', null, '2031-03-05');

select pg_temp.verificar('08 medio dia ya ocupado: la UO corta de 1.0 no cabe el miercoles (0 libre) y va completa al jueves 2031-03-06',
  pg_temp.pasos('PRUEBA-AUS-4') = '1:2031-03-06,2:2031-03-06,3:2031-03-06,4:2031-03-06'
  and pg_temp.carga_uo('PRUEBA-AUS-4') = '2031-03-06:1');

select pg_temp.uo_pendiente('PRUEBA-AUS-5', 'Aereo', 15);
select pg_temp.asignar('PRUEBA-AUS-5', 'e7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-00000000000a', '2031-03-10');

select pg_temp.verificar('09 vacaciones del analista: los pasos de D2 quedan el lunes 2031-03-10 y la validacion de A1 pasa al martes 2031-03-11',
  pg_temp.pasos('PRUEBA-AUS-5') = '1:2031-03-10,2:2031-03-10,3:2031-03-10,4:2031-03-10'
  and pg_temp.val_fecha('PRUEBA-AUS-5') = '2031-03-11'
  and (select string_agg(c.fecha::text || ':' || trim_scale(c.jornadas)::text, ',')
         from public.plan_carga_actividad c
         join public.actividades_uo a on a.id = c.actividad_id
        where a.uo_id = pg_temp.uo('PRUEBA-AUS-5')) = '2031-03-11:0.5');

select pg_temp.uo_pendiente('PRUEBA-AUS-6', 'Aereo', 75);
select pg_temp.asignar('PRUEBA-AUS-6', 'e7000000-0000-4000-8000-000000000002', null, '2031-03-17');

select pg_temp.verificar('10 UO larga (2.5): no reserva nada el martes 2031-03-18 (D2 de vacaciones), la suma sigue en 2.5 y el ultimo paso vence despues',
  not exists (select 1 from public.plan_carga_uo c where c.uo_id = pg_temp.uo('PRUEBA-AUS-6') and c.fecha = '2031-03-18')
  and (select sum(c.jornadas) = 2.5 from public.plan_carga_uo c where c.uo_id = pg_temp.uo('PRUEBA-AUS-6'))
  and (select min(c.fecha) = '2031-03-17' from public.plan_carga_uo c where c.uo_id = pg_temp.uo('PRUEBA-AUS-6'))
  and (select max(a.fecha_programada) > '2031-03-18' from public.actividades_uo a where a.uo_id = pg_temp.uo('PRUEBA-AUS-6')));

-- -----------------------------------------------------------------------------
-- Checks de la tabla
-- -----------------------------------------------------------------------------

do $$
begin
  begin
    insert into public.plan_ausencias (profile_id, fecha, fraccion, tipo)
    values ('e7000000-0000-4000-8000-000000000002', '2031-03-04', 0.7, 'Permiso');
    raise exception 'FALLO 11 se guardo fraccion 0.7';
  exception when check_violation then null;
  end;
  begin
    insert into public.plan_ausencias (profile_id, fecha, fraccion, tipo)
    values ('e7000000-0000-4000-8000-000000000002', '2031-03-04', 1, 'Incapacidad');
    raise exception 'FALLO 11 se guardo un tipo fuera de la lista';
  exception when check_violation then null;
  end;
  begin
    insert into public.plan_ausencias (profile_id, fecha, fraccion, tipo, nota)
    values ('e7000000-0000-4000-8000-000000000002', '2031-03-04', 1, 'Otro', repeat('x', 121));
    raise exception 'FALLO 11 se guardo una nota de 121 caracteres';
  exception when check_violation then null;
  end;
  begin
    insert into public.plan_ausencias (profile_id, fecha, fraccion, tipo)
    values ('e7000000-0000-4000-8000-000000000001', '2031-03-03', 0.5, 'Permiso');
    raise exception 'FALLO 11 se guardaron dos ausencias de la misma persona el mismo dia';
  exception when unique_violation then null;
  end;
  raise notice 'OK   11 checks: fraccion solo 0.5 o 1, tipo de la lista, nota hasta 120 y una sola ausencia por persona y dia';
end $$;

-- -----------------------------------------------------------------------------
-- Quien puede escribir
-- -----------------------------------------------------------------------------

-- D1 (no es coordinador)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e7000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare v int;
begin
  if (select count(*) from public.plan_ausencias where fecha between '2031-03-01' and '2031-03-31') <> 5 then
    raise exception 'FALLO 12 D1 no ve las 5 ausencias de prueba';
  end if;

  begin
    insert into public.plan_ausencias (profile_id, fecha, fraccion, tipo)
    values ('e7000000-0000-4000-8000-000000000001', '2031-03-12', 1, 'Vacaciones');
    raise exception 'FALLO 12 D1 registro una ausencia';
  exception when insufficient_privilege then null;
  end;

  delete from public.plan_ausencias where profile_id = 'e7000000-0000-4000-8000-000000000001';
  get diagnostics v = row_count;
  if v <> 0 then raise exception 'FALLO 12 D1 borro ausencias'; end if;

  begin
    insert into public.plan_dias_inhabiles (fecha, descripcion) values ('2031-03-21', 'Prueba');
    raise exception 'FALLO 12 D1 agrego un feriado';
  exception when insufficient_privilege then null;
  end;

  delete from public.plan_dias_inhabiles;
  get diagnostics v = row_count;
  if v <> 0 then raise exception 'FALLO 12 D1 borro feriados'; end if;

  begin
    update public.plan_ausencias set tipo = 'Otro';
    raise exception 'FALLO 12 D1 pudo hacer UPDATE';
  exception when insufficient_privilege then null;
  end;

  raise notice 'OK   12 quien no es coordinador lee las ausencias pero no agrega, borra ni edita ausencias ni feriados';
end $$;
reset role;

-- Coordinador
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
do $$
declare v int;
begin
  insert into public.plan_ausencias (profile_id, fecha, fraccion, tipo, nota)
  values ('e7000000-0000-4000-8000-000000000002', '2031-03-12', 0.5, 'Permiso', 'Tramite personal');
  if (select creado_por from public.plan_ausencias
       where profile_id = 'e7000000-0000-4000-8000-000000000002' and fecha = '2031-03-12')
     is distinct from '7063db07-ed16-4ca5-8c98-53b63d128702' then
    raise exception 'FALLO 13 creado_por no es el coordinador';
  end if;

  delete from public.plan_ausencias
   where profile_id = 'e7000000-0000-4000-8000-000000000002' and fecha = '2031-03-12';
  get diagnostics v = row_count;
  if v <> 1 then raise exception 'FALLO 13 el coordinador no pudo quitar la ausencia'; end if;

  raise notice 'OK   13 el coordinador agrega y quita ausencias; creado_por queda con su usuario';
end $$;

do $$
begin
  begin
    insert into public.plan_ausencias (profile_id, fecha, fraccion, tipo, creado_por)
    values ('e7000000-0000-4000-8000-000000000002', '2031-03-13', 1, 'Vacaciones', 'e7000000-0000-4000-8000-000000000001');
    raise exception 'FALLO 14 el coordinador guardo creado_por de otra persona';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK   14 creado_por no se puede poner a nombre de otra persona';
end $$;

do $$
declare v int;
begin
  insert into public.plan_dias_inhabiles (fecha, descripcion) values ('2031-03-21', 'Feriado de prueba');
  delete from public.plan_dias_inhabiles where fecha = '2031-03-21';
  get diagnostics v = row_count;
  if v <> 1 then raise exception 'FALLO 15 el coordinador no pudo quitar el feriado'; end if;
  raise notice 'OK   15 el coordinador agrega y quita feriados';
end $$;
reset role;

-- anon
set local role anon;
do $$
begin
  begin
    perform 1 from public.plan_ausencias limit 1;
    raise exception 'FALLO 16 anon leyo plan_ausencias';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK   16 anon no puede leer plan_ausencias';
end $$;
reset role;

select 'OK: todas las pruebas pasaron (16)' as resultado;

rollback;
