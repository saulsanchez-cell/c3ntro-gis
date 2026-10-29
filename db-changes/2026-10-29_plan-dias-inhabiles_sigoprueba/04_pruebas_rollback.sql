-- Que hace: prueba dentro de begin ... rollback que proponer_fechas_uo salta los dias inhabiles cargados por el 01 cuando se pide empezar en esa fecha (UO corta desde lunes, desde viernes y una UO larga cuyo pulido cruza el 2026-12-25); perfiles ficticios, no deja datos.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Solo despues del 01. No se corre en produccion.
-- Resultado esperado: 1 fila "OK: todas las pruebas pasaron (6)...". Si una falla, el script se detiene con "FALLO <n> ..." y no queda nada: mandar el mensaje completo.
-- Corrido en SIGOprueba el 2026-10-29: OK (6). No se corre en producción

begin;

do $$
begin
  if (select count(*) from public.plan_dias_inhabiles
       where fecha in ('2026-11-16', '2026-12-25', '2027-01-01', '2027-02-01', '2027-03-15', '2027-09-16', '2027-11-15')) <> 7 then
    raise exception 'Primero corre 01_escribe_dias-inhabiles.sql';
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

create function pg_temp.uo_planificada(p_ref text, p_metodo text, p_km numeric, p_dig uuid, p_inicio date)
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
  perform public.proponer_fechas_uo(v, p_inicio);
  return v;
end $$;

create function pg_temp.carga(p_ref text)
returns text language sql as $$
  select string_agg(c.fecha::text || ':' || trim_scale(c.jornadas)::text, ',' order by c.fecha)
    from public.plan_carga_uo c where c.uo_id = pg_temp.uo(p_ref)
$$;

create function pg_temp.fechas(p_ref text)
returns text language sql as $$
  select string_agg(a.orden::text || ':' || coalesce(a.fecha_programada::text, '-'), ',' order by a.orden)
    from public.actividades_uo a where a.uo_id = pg_temp.uo(p_ref)
$$;

insert into public.profiles (id, nombre, iniciales, rol) values
  ('e0000000-0000-4000-8000-00000000000e', 'Prueba Inhabil E', 'PIE', 'digitalizador'),
  ('e0000000-0000-4000-8000-00000000000f', 'Prueba Inhabil F', 'PIF', 'digitalizador');

select pg_temp.uo_planificada('PRUEBA-INHABIL-1', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000e', '2027-02-01');
select pg_temp.verificar('01 UO corta pedida el lunes inhabil 2027-02-01: empieza el martes 2027-02-02',
  pg_temp.carga('PRUEBA-INHABIL-1') = '2027-02-02:0.5'
  and pg_temp.fechas('PRUEBA-INHABIL-1') = '1:2027-02-02,2:2027-02-02,3:2027-02-02,4:2027-02-02');

select pg_temp.uo_planificada('PRUEBA-INHABIL-2', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000e', '2026-11-16');
select pg_temp.verificar('02 UO corta pedida el lunes inhabil 2026-11-16: empieza el martes 2026-11-17',
  pg_temp.carga('PRUEBA-INHABIL-2') = '2026-11-17:0.5'
  and pg_temp.fechas('PRUEBA-INHABIL-2') = '1:2026-11-17,2:2026-11-17,3:2026-11-17,4:2026-11-17');

select pg_temp.uo_planificada('PRUEBA-INHABIL-3', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000e', '2027-01-01');
select pg_temp.verificar('03 UO corta pedida el viernes inhabil 2027-01-01: salta el fin de semana y empieza el lunes 2027-01-04',
  pg_temp.carga('PRUEBA-INHABIL-3') = '2027-01-04:0.5'
  and pg_temp.fechas('PRUEBA-INHABIL-3') = '1:2027-01-04,2:2027-01-04,3:2027-01-04,4:2027-01-04');

select pg_temp.uo_planificada('PRUEBA-INHABIL-4', 'Subterraneo', 52.5, 'e0000000-0000-4000-8000-00000000000f', '2026-12-24');
select pg_temp.verificar('04 UO larga (3.0) desde el jueves 2026-12-24: bloque 1.0 ese dia; el pulido salta el 2026-12-25 y el fin de semana (lunes 28 y martes 29); suma 3.0',
  pg_temp.carga('PRUEBA-INHABIL-4') = '2026-12-24:1,2026-12-28:1,2026-12-29:1'
  and pg_temp.fechas('PRUEBA-INHABIL-4') = '1:2026-12-24,2:2026-12-24,3:2026-12-24,4:2026-12-29'
  and (select sum(jornadas) = 3 from public.plan_carga_uo where uo_id = pg_temp.uo('PRUEBA-INHABIL-4')));

select pg_temp.verificar('05 ninguna carga ni actividad de prueba cae en un dia inhabil',
  not exists (select 1 from public.plan_carga_uo c
                join public.plan_dias_inhabiles i on i.fecha = c.fecha
               where c.uo_id in (pg_temp.uo('PRUEBA-INHABIL-1'), pg_temp.uo('PRUEBA-INHABIL-2'),
                                 pg_temp.uo('PRUEBA-INHABIL-3'), pg_temp.uo('PRUEBA-INHABIL-4')))
  and not exists (select 1 from public.actividades_uo a
                    join public.plan_dias_inhabiles i on i.fecha = a.fecha_programada
                   where a.uo_id in (pg_temp.uo('PRUEBA-INHABIL-1'), pg_temp.uo('PRUEBA-INHABIL-2'),
                                     pg_temp.uo('PRUEBA-INHABIL-3'), pg_temp.uo('PRUEBA-INHABIL-4'))));

select pg_temp.verificar('06 consistencia: plan_inconsistencias() vacio',
  not exists (select 1 from public.plan_inconsistencias()));

rollback;

select 'OK: todas las pruebas pasaron (6). Se hizo rollback, no quedaron datos.' as resultado;
