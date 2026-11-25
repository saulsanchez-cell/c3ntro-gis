-- Que hace: pruebas de liberar y devolver carga (12) dentro de begin ... rollback, con fechas fijas en 2031, perfiles ficticios y SET LOCAL ROLE + request.jwt.claims para actuar como coordinador o digitalizador; no deja datos.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Solo despues de 01 y de los valores nuevos (2026-11-25_plan-recalibracion). No se corre en produccion.
-- Resultado esperado: mensajes "OK   01" a "OK   12" en la pestana de mensajes y al final 1 fila "OK: todas las pruebas pasaron (12)".
--   Si una falla, el script se detiene con "FALLO <n> ..." y no queda nada: mandar el mensaje completo.
--
-- Perfiles ficticios:
--   D1 e3000000-0000-4000-8000-000000000001 (digitalizador)   A1 e3000000-0000-4000-8000-00000000000a (analista)
-- UO PRUEBA-LIB-1: Mixto 105 km = 3.0 jornadas con los valores nuevos (35 km por jornada).
--   Asignada desde el lunes 2031-03-03: carga 1.0 lunes, 1.0 martes y 1.0 miercoles.
--   Ademas se le agrega a mano 0.5 el 2026-01-05 para simular carga de un dia pasado.
-- UO PRUEBA-LIB-2: Aereo 30 km = 0.5 jornadas, desde el 2031-03-10.

begin;

do $$
begin
  if to_regclass('public.plan_carga_liberada') is null then
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

create function pg_temp.carga_uo(p_ref text)
returns text language sql as $$
  select string_agg(c.fecha::text || ':' || trim_scale(c.jornadas)::text, ',' order by c.fecha)
    from public.plan_carga_uo c where c.uo_id = pg_temp.uo(p_ref)
$$;

create function pg_temp.liberada(p_ref text, p_mov text)
returns numeric language sql as $$
  select coalesce(sum(l.jornadas), 0)
    from public.plan_carga_liberada l
   where l.uo_id = pg_temp.uo(p_ref) and l.movimiento = p_mov
$$;

create function pg_temp.carga_val(p_ref text)
returns text language sql as $$
  select string_agg(c.fecha::text || ':' || trim_scale(c.jornadas)::text, ',' order by c.fecha)
    from public.plan_carga_actividad c
    join public.actividades_uo a on a.id = c.actividad_id
   where a.uo_id = pg_temp.uo(p_ref)
$$;

insert into public.profiles (id, nombre, iniciales, rol) values
  ('e3000000-0000-4000-8000-000000000001', 'Prueba Lib D1', 'PL1', 'digitalizador'),
  ('e3000000-0000-4000-8000-00000000000a', 'Prueba Lib A1', 'PLA', 'digitalizador');

insert into public.profiles (id, nombre, iniciales, rol) values
  ('7063db07-ed16-4ca5-8c98-53b63d128702', 'Prueba Coordinador', 'PC', 'coordinador')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Estructura y permisos
-- -----------------------------------------------------------------------------

select pg_temp.verificar('01 plan_carga_liberada con RLS; authenticated solo SELECT; anon y public sin nada',
  (select relrowsecurity from pg_class where oid = 'public.plan_carga_liberada'::regclass)
  and has_table_privilege('authenticated', 'public.plan_carga_liberada', 'select')
  and not has_table_privilege('authenticated', 'public.plan_carga_liberada', 'insert, update, delete, truncate')
  and not has_table_privilege('anon', 'public.plan_carga_liberada', 'select, insert, update, delete, truncate')
  and not has_table_privilege('public', 'public.plan_carga_liberada', 'select, insert, update, delete, truncate'));

select pg_temp.verificar('02 marcar y desmarcar siguen SECURITY DEFINER, search_path vacio y solo authenticated; plan_inconsistencias sin EXECUTE para nadie',
  (select bool_and(prosecdef
                   and coalesce(proconfig @> array['search_path=""'], false)
                   and has_function_privilege('authenticated', oid, 'execute')
                   and not has_function_privilege('anon', oid, 'execute')
                   and not has_function_privilege('public', oid, 'execute'))
     from pg_proc
    where oid in ('public.marcar_actividad(uuid,timestamptz,text)'::regprocedure,
                  'public.desmarcar_actividad(uuid,text)'::regprocedure))
  and not has_function_privilege('authenticated', 'public.plan_inconsistencias()'::regprocedure, 'execute')
  and not has_function_privilege('anon', 'public.plan_inconsistencias()'::regprocedure, 'execute')
  and not has_function_privilege('public', 'public.plan_inconsistencias()'::regprocedure, 'execute'));

-- -----------------------------------------------------------------------------
-- Preparacion: asignar como coordinador
-- -----------------------------------------------------------------------------

insert into public.unidades_operativas (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo, km_teoricos) values
  ('PRUEBA-LIB-1', 'Proyecto de prueba PRUEBA-LIB-1', 'Baseline', 'Pendiente', 'Mixto', 105),
  ('PRUEBA-LIB-2', 'Proyecto de prueba PRUEBA-LIB-2', 'Baseline', 'Pendiente', 'Aereo', 30);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e3000000-0000-4000-8000-000000000001', analista_qa_id = 'e3000000-0000-4000-8000-00000000000a',
       estado = 'Asignada', fecha_no_antes_de = '2031-03-03'
 where referencia_operativa = 'PRUEBA-LIB-1';
update public.unidades_operativas
   set digitalizador_id = 'e3000000-0000-4000-8000-000000000001', analista_qa_id = 'e3000000-0000-4000-8000-00000000000a',
       estado = 'Asignada', fecha_no_antes_de = '2031-03-10'
 where referencia_operativa = 'PRUEBA-LIB-2';
reset role;

-- Carga de un dia pasado (sin sesion: el SQL Editor puede escribir en plan_carga_uo)
insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
values (pg_temp.uo('PRUEBA-LIB-1'), '2026-01-05', 'e3000000-0000-4000-8000-000000000001', 0.5);

select pg_temp.verificar('03 preparacion: LIB-1 con 3.0 jornadas (lun, mar, mie de 2031) + 0.5 pasada; validacion del analista con su carga',
  public.plan_jornadas_uo(pg_temp.uo('PRUEBA-LIB-1'), '2031-03-03') = 3.0
  and pg_temp.carga_uo('PRUEBA-LIB-1') = '2026-01-05:0.5,2031-03-03:1,2031-03-04:1,2031-03-05:1'
  and pg_temp.carga_val('PRUEBA-LIB-1') is not null
  and pg_temp.liberada('PRUEBA-LIB-1', 'liberada') = 0);

-- -----------------------------------------------------------------------------
-- Liberar
-- -----------------------------------------------------------------------------

-- D1 marca los pasos 1 a 3
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.marcar_actividad(a.id)
  from public.actividades_uo a
  join public.plantillas_actividad p on p.id = a.plantilla_id
  join public.unidades_operativas u on u.id = a.uo_id
 where u.referencia_operativa = 'PRUEBA-LIB-1' and p.momento_creacion = 'asignacion' and a.orden in (1, 2, 3);
reset role;

select pg_temp.verificar('04 con pasos pendientes no se libera nada',
  pg_temp.carga_uo('PRUEBA-LIB-1') = '2026-01-05:0.5,2031-03-03:1,2031-03-04:1,2031-03-05:1'
  and pg_temp.liberada('PRUEBA-LIB-1', 'liberada') = 0);

-- D1 marca el paso 4
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.marcar_actividad(a.id)
  from public.actividades_uo a
  join public.plantillas_actividad p on p.id = a.plantilla_id
  join public.unidades_operativas u on u.id = a.uo_id
 where u.referencia_operativa = 'PRUEBA-LIB-1' and p.momento_creacion = 'asignacion' and a.orden = 4;
reset role;

select pg_temp.verificar('05 al completar el paso 4 se borra la carga desde manana; la del dia pasado se queda',
  pg_temp.carga_uo('PRUEBA-LIB-1') = '2026-01-05:0.5');

select pg_temp.verificar('06 registro: 3 filas liberada por 3.0, del paso 4, con usuario y responsable D1',
  (select count(*) = 3
          and sum(l.jornadas) = 3.0
          and bool_and(l.movimiento = 'liberada')
          and bool_and(l.usuario_id = 'e3000000-0000-4000-8000-000000000001')
          and bool_and(l.responsable_id = 'e3000000-0000-4000-8000-000000000001')
          and bool_and(a.orden = 4)
     from public.plan_carga_liberada l
     join public.actividades_uo a on a.id = l.actividad_id
    where l.uo_id = pg_temp.uo('PRUEBA-LIB-1')));

select pg_temp.verificar('07 la carga de la validacion del analista no se toca',
  pg_temp.carga_val('PRUEBA-LIB-1') is not null
  and (select count(*) = 0 from public.plan_carga_liberada l
        join public.actividades_uo a on a.id = l.actividad_id
        join public.plantillas_actividad p on p.id = a.plantilla_id
       where p.momento_creacion = 'validacion'));

select pg_temp.verificar('08 plan_inconsistencias no marca R1, R2 ni R4 en una UO terminada',
  not exists (select 1 from public.plan_inconsistencias() i
               where i.referencia = 'PRUEBA-LIB-1' and left(i.regla, 2) in ('R1', 'R2', 'R4')));

-- -----------------------------------------------------------------------------
-- Devolver
-- -----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.desmarcar_actividad(a.id, 'Prueba: se marco por error')
  from public.actividades_uo a
  join public.plantillas_actividad p on p.id = a.plantilla_id
  join public.unidades_operativas u on u.id = a.uo_id
 where u.referencia_operativa = 'PRUEBA-LIB-1' and p.momento_creacion = 'asignacion' and a.orden = 4;
reset role;

select pg_temp.verificar('09 al desmarcar se devuelve la carga futura en sus mismas fechas y queda el registro devuelta',
  pg_temp.carga_uo('PRUEBA-LIB-1') = '2026-01-05:0.5,2031-03-03:1,2031-03-04:1,2031-03-05:1'
  and pg_temp.liberada('PRUEBA-LIB-1', 'devuelta') = 3.0
  and (select bool_and(c.responsable_id = 'e3000000-0000-4000-8000-000000000001')
         from public.plan_carga_uo c where c.uo_id = pg_temp.uo('PRUEBA-LIB-1')));

-- Marcar otra vez el paso 4 libera de nuevo; desmarcar un paso intermedio tambien devuelve
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.marcar_actividad(a.id)
  from public.actividades_uo a
  join public.plantillas_actividad p on p.id = a.plantilla_id
  join public.unidades_operativas u on u.id = a.uo_id
 where u.referencia_operativa = 'PRUEBA-LIB-1' and p.momento_creacion = 'asignacion' and a.orden = 4;
reset role;

select pg_temp.verificar('10 marcar de nuevo libera otra vez: carga solo la pasada; liberada 6.0 y devuelta 3.0',
  pg_temp.carga_uo('PRUEBA-LIB-1') = '2026-01-05:0.5'
  and pg_temp.liberada('PRUEBA-LIB-1', 'liberada') = 6.0
  and pg_temp.liberada('PRUEBA-LIB-1', 'devuelta') = 3.0);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.desmarcar_actividad(a.id, 'Prueba: falto revisar el paso dos')
  from public.actividades_uo a
  join public.plantillas_actividad p on p.id = a.plantilla_id
  join public.unidades_operativas u on u.id = a.uo_id
 where u.referencia_operativa = 'PRUEBA-LIB-1' and p.momento_creacion = 'asignacion' and a.orden = 2;
reset role;

select pg_temp.verificar('11 desmarcar el paso 2 de una UO terminada tambien devuelve la carga (una sola vez)',
  pg_temp.carga_uo('PRUEBA-LIB-1') = '2026-01-05:0.5,2031-03-03:1,2031-03-04:1,2031-03-05:1'
  and pg_temp.liberada('PRUEBA-LIB-1', 'devuelta') = 6.0);

-- LIB-2: marcar y desmarcar el paso 1 sin haber terminado no mueve la carga
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e3000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.marcar_actividad(a.id)
  from public.actividades_uo a
  join public.plantillas_actividad p on p.id = a.plantilla_id
  join public.unidades_operativas u on u.id = a.uo_id
 where u.referencia_operativa = 'PRUEBA-LIB-2' and p.momento_creacion = 'asignacion' and a.orden = 1;
select public.desmarcar_actividad(a.id, 'Prueba: paso uno marcado por error')
  from public.actividades_uo a
  join public.plantillas_actividad p on p.id = a.plantilla_id
  join public.unidades_operativas u on u.id = a.uo_id
 where u.referencia_operativa = 'PRUEBA-LIB-2' and p.momento_creacion = 'asignacion' and a.orden = 1;
reset role;

select pg_temp.verificar('12 en una UO sin carga liberada, marcar y desmarcar un paso no cambia su carga ni el registro',
  pg_temp.carga_uo('PRUEBA-LIB-2') = '2031-03-10:0.5'
  and pg_temp.liberada('PRUEBA-LIB-2', 'liberada') = 0
  and pg_temp.liberada('PRUEBA-LIB-2', 'devuelta') = 0);

select 'OK: todas las pruebas pasaron (12)' as resultado;

rollback;
