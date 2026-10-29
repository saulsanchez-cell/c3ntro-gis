-- Que hace: pruebas de fecha_no_antes_de (19) dentro de begin ... rollback, con fechas fijas en 2031, perfiles ficticios y SET LOCAL ROLE + request.jwt.claims para asignar como coordinador; no deja datos.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Solo despues de 01. Despues correr tambien db-changes/2026-10-26_plan-semanal_pruebas.sql (las 52) como regresion.
-- Resultado esperado: 1 fila "OK: todas las pruebas pasaron (19)...". Si una falla, el script se detiene con "FALLO <n> ..." y no queda nada: mandar el mensaje completo.
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-10-29
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-10-29
-- Corrido en SIGOprueba el 2026-10-29: OK (19); regresión de las 52: OK
-- Las pruebas no se corren en producción

begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'unidades_operativas'
                    and column_name = 'fecha_no_antes_de') then
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

create function pg_temp.huella(p_uo uuid)
returns text language sql as $$
  select (select string_agg(a.orden::text || ':' || coalesce(a.fecha_programada::text, '-') || ':' || coalesce(a.fecha_origen, '-'), ',' order by a.orden)
            from public.actividades_uo a where a.uo_id = p_uo)
         || ' | ' ||
         coalesce((select string_agg(c.fecha::text || ':' || trim_scale(c.jornadas)::text || ':' || c.responsable_id::text, ',' order by c.fecha)
                     from public.plan_carga_uo c where c.uo_id = p_uo), 'sin carga')
$$;

create function pg_temp.hoy()
returns date language sql as $$
  select (now() at time zone 'America/Mexico_City')::date
$$;

create function pg_temp.proponer_fechas_uo_anterior(p_uo uuid, p_inicio date default null)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c_max_dias constant int := 366;
  v_inicio   date := coalesce(p_inicio, public.plan_hoy());
  v_uo       record;
  v_minimo   numeric;
  v_bloque   numeric;
  v_total    numeric;
  v_dia      date;
  v_libre    numeric;
  v_tomar    numeric;
  v_restante numeric;
  v_fin_1_3  date;
  v_ultimo   date;
  v_iter     int := 0;
begin
  select u.id, u.referencia_operativa, u.digitalizador_id, u.metodo_constructivo, u.km_teoricos
    into v_uo
    from public.unidades_operativas u
   where u.id = p_uo;
  if not found then
    raise exception 'UO no encontrada' using errcode = 'P0002';
  end if;

  if v_uo.digitalizador_id is null then
    raise warning 'Plan semanal: la UO % no tiene digitalizador; no se proponen fechas', v_uo.referencia_operativa;
    return;
  end if;

  -- No se recalcula sola
  if exists (select 1 from public.plan_carga_uo c where c.uo_id = p_uo) then
    return;
  end if;

  if not exists (select 1 from public.actividades_uo a
                   join public.plantillas_actividad p on p.id = a.plantilla_id
                  where a.uo_id = p_uo and p.momento_creacion = 'asignacion') then
    raise notice 'Plan semanal: la UO % no tiene actividades de asignacion', v_uo.referencia_operativa;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('plan_semanal:' || v_uo.digitalizador_id::text, 0));

  v_minimo := public.plan_parametro('jornada_minima_uo', v_inicio);
  v_bloque := public.plan_parametro('jornadas_pasos_1_3_uo_larga', v_inicio);
  if v_minimo is null or v_minimo <= 0 or v_bloque is null or v_bloque <= 0 then
    raise exception 'Faltan parametros vigentes validos en plan_parametros (jornada_minima_uo > 0, jornadas_pasos_1_3_uo_larga > 0)'
      using errcode = 'P0001';
  end if;

  if public.plan_rendimiento(v_uo.metodo_constructivo, v_inicio) is null then
    raise warning 'Plan semanal: la UO % no tiene metodo constructivo con rendimiento vigente; se usan % jornadas',
      v_uo.referencia_operativa, v_minimo;
  end if;
  v_total := public.plan_jornadas_uo(p_uo, v_inicio);

  v_dia := v_inicio - 1;

  if v_total <= 1 then
    -- UO corta (hasta una jornada completa): en un solo día, sin partir
    loop
      v_dia  := v_dia + 1;
      v_iter := v_iter + 1;
      if v_iter > c_max_dias then
        raise exception 'Sin capacidad para % jornadas en % dias desde %', v_total, c_max_dias, v_inicio using errcode = 'P0001';
      end if;
      v_libre := public.plan_capacidad_dia(v_dia) - public.plan_carga_persona(v_uo.digitalizador_id, v_dia);
      exit when v_libre >= v_total;
    end loop;

    insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
    values (p_uo, v_dia, v_uo.digitalizador_id, v_total);
    v_fin_1_3 := v_dia;
    v_ultimo  := v_dia;
  else
    -- UO larga, bloque de pasos 1 a 3: jornadas fijas, tomando lo libre de cada
    -- día; puede ocupar dos días (p. ej. viernes 0.75 + lunes 0.25)
    v_bloque   := least(v_bloque, v_total);
    v_restante := v_bloque;
    while v_restante > 0 loop
      v_dia  := v_dia + 1;
      v_iter := v_iter + 1;
      if v_iter > c_max_dias then
        raise exception 'Sin capacidad en % dias desde %', c_max_dias, v_inicio using errcode = 'P0001';
      end if;
      v_libre := public.plan_capacidad_dia(v_dia) - public.plan_carga_persona(v_uo.digitalizador_id, v_dia);
      if v_libre > 0 then
        v_tomar := least(v_libre, v_restante);
        insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
        values (p_uo, v_dia, v_uo.digitalizador_id, v_tomar);
        v_restante := v_restante - v_tomar;
      end if;
    end loop;
    v_fin_1_3 := v_dia;
    v_ultimo  := v_dia;

    -- Pulido: el resto, desde el día siguiente al bloque, según lo libre de cada día
    v_restante := v_total - v_bloque;
    while v_restante > 0 loop
      v_dia  := v_dia + 1;
      v_iter := v_iter + 1;
      if v_iter > c_max_dias then
        raise exception 'Sin capacidad en % dias desde %', c_max_dias, v_inicio using errcode = 'P0001';
      end if;
      v_libre := public.plan_capacidad_dia(v_dia) - public.plan_carga_persona(v_uo.digitalizador_id, v_dia);
      if v_libre > 0 then
        v_tomar := least(v_libre, v_restante);
        insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
        values (p_uo, v_dia, v_uo.digitalizador_id, v_tomar);
        v_restante := v_restante - v_tomar;
      end if;
    end loop;
    v_ultimo := v_dia;
  end if;

  -- Último paso (pulido) vence el último día reservado; los demás, el último
  -- día del bloque 1 a 3 (en una UO corta, el mismo día)
  with pasos as (
    select a.id, a.orden, max(a.orden) over (partition by a.ronda) as orden_max
      from public.actividades_uo a
      join public.plantillas_actividad p on p.id = a.plantilla_id
     where a.uo_id = p_uo
       and p.momento_creacion = 'asignacion'
  )
  update public.actividades_uo a
     set fecha_programada = case when s.orden = s.orden_max then v_ultimo else v_fin_1_3 end,
         fecha_origen     = 'propuesta'
    from pasos s
   where a.id = s.id;
end;
$$;

create function pg_temp.propuesta_con(p_uo uuid, p_inicio date, p_columna date, p_funcion text)
returns text language plpgsql as $$
declare v text;
begin
  begin
    delete from public.plan_carga_uo where uo_id = p_uo;
    update public.actividades_uo set fecha_programada = null, fecha_origen = null where uo_id = p_uo;
    update public.unidades_operativas set fecha_no_antes_de = p_columna where id = p_uo;
    execute format('select %s($1, $2)', p_funcion) using p_uo, p_inicio;
    v := pg_temp.huella(p_uo);
    raise exception using errcode = 'P0099', message = 'deshacer';
  exception when sqlstate 'P0099' then
    return v;
  end;
end $$;

insert into public.profiles (id, nombre, iniciales, rol) values
  ('e0000000-0000-4000-8000-00000000000c', 'Prueba Inicio C', 'PIC', 'digitalizador'),
  ('e0000000-0000-4000-8000-00000000000d', 'Prueba Inicio D', 'PID', 'digitalizador');

insert into public.profiles (id, nombre, iniciales, rol) values
  ('7063db07-ed16-4ca5-8c98-53b63d128702', 'Prueba Coordinador', 'PC', 'coordinador')
on conflict (id) do nothing;

select pg_temp.verificar('01 la columna existe: date, acepta nulos, sin default',
  (select count(*) = 1 and bool_and(data_type = 'date' and is_nullable = 'YES' and column_default is null)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'unidades_operativas' and column_name = 'fecha_no_antes_de'));

select pg_temp.verificar('02 proponer_fechas_uo: SECURITY DEFINER, search_path vacio, sin EXECUTE para public, anon ni authenticated, y lee la columna',
  (select prosecdef
          and coalesce(proconfig @> array['search_path=""'], false)
          and prosrc like '%greatest(coalesce(p_inicio, public.plan_hoy()), v_uo.fecha_no_antes_de)%'
     from pg_proc where oid = 'public.proponer_fechas_uo(uuid,date)'::regprocedure)
  and not has_function_privilege('public', 'public.proponer_fechas_uo(uuid,date)', 'execute')
  and not has_function_privilege('anon', 'public.proponer_fechas_uo(uuid,date)', 'execute')
  and not has_function_privilege('authenticated', 'public.proponer_fechas_uo(uuid,date)', 'execute'));

select pg_temp.verificar('03 generar_actividades_uo y reasignar_actividades_uo sin cambios (huellas medidas el 2026-10-29)',
  md5(replace(pg_get_functiondef('public.generar_actividades_uo()'::regprocedure), E'\r', '')) = '0f2874819268a01fadb35fbb4ad6c6d3'
  and md5(replace(pg_get_functiondef('public.reasignar_actividades_uo()'::regprocedure), E'\r', '')) = '4ba2f7668eb464789c175d716f862aca');

select pg_temp.verificar('04 authenticated puede escribir la columna (como el resto de unidades_operativas)',
  has_column_privilege('authenticated', 'public.unidades_operativas', 'fecha_no_antes_de', 'update'));

select pg_temp.uo_sin_plan('PRUEBA-INICIO-N0', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000c');
select public.proponer_fechas_uo(pg_temp.uo('PRUEBA-INICIO-N0'), '2031-03-03');
select pg_temp.uo_sin_plan('PRUEBA-INICIO-N1', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000c');
select pg_temp.uo_sin_plan('PRUEBA-INICIO-N2', 'Aereo', 30, 'e0000000-0000-4000-8000-00000000000c');
select pg_temp.uo_sin_plan('PRUEBA-INICIO-N3', 'Subterraneo', 52.5, 'e0000000-0000-4000-8000-00000000000c');
select pg_temp.uo_sin_plan('PRUEBA-INICIO-N4', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000c');
select pg_temp.uo_sin_plan('PRUEBA-INICIO-N5', 'Subterraneo', 52.5, 'e0000000-0000-4000-8000-00000000000c');

select pg_temp.verificar('05 columna en null: resultado identico al de la version anterior (corta, 1.0 en viernes, larga desde viernes, y desde hoy corta y larga)',
  (select bool_and(n.nueva = n.anterior and n.nueva not like '%sin carga%' and n.nueva not like '%:-:%')
     from (select pg_temp.propuesta_con(pg_temp.uo(c.ref), c.inicio, null, 'public.proponer_fechas_uo') as nueva,
                  pg_temp.propuesta_con(pg_temp.uo(c.ref), c.inicio, null, 'pg_temp.proponer_fechas_uo_anterior') as anterior
             from (values ('PRUEBA-INICIO-N1', '2031-03-03'::date),
                          ('PRUEBA-INICIO-N2', '2031-03-07'::date),
                          ('PRUEBA-INICIO-N3', '2031-04-11'::date),
                          ('PRUEBA-INICIO-N4', null::date),
                          ('PRUEBA-INICIO-N5', null::date)) as c(ref, inicio)) n)
  and split_part(pg_temp.propuesta_con(pg_temp.uo('PRUEBA-INICIO-N1'), '2031-03-03', null, 'public.proponer_fechas_uo'), ' | ', 1)
      = '1:2031-03-03:propuesta,2:2031-03-03:propuesta,3:2031-03-03:propuesta,4:2031-03-03:propuesta'
  and split_part(pg_temp.propuesta_con(pg_temp.uo('PRUEBA-INICIO-N2'), '2031-03-07', null, 'public.proponer_fechas_uo'), ' | ', 2)
      = '2031-03-10:1:e0000000-0000-4000-8000-00000000000c'
  and pg_temp.carga('PRUEBA-INICIO-N1') is null);

select pg_temp.uo_pendiente('PRUEBA-INICIO-T0', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000c', estado = 'Asignada'
 where referencia_operativa = 'PRUEBA-INICIO-T0';
reset role;

select pg_temp.verificar('06 asignar por trigger sin fecha: columna null y mismo resultado que la version anterior, desde hoy',
  (select fecha_no_antes_de is null from public.unidades_operativas where referencia_operativa = 'PRUEBA-INICIO-T0')
  and (select count(*) = 4 and bool_and(fecha_programada >= pg_temp.hoy()) from public.actividades_uo where uo_id = pg_temp.uo('PRUEBA-INICIO-T0'))
  and pg_temp.huella(pg_temp.uo('PRUEBA-INICIO-T0'))
      = pg_temp.propuesta_con(pg_temp.uo('PRUEBA-INICIO-T0'), null, null, 'pg_temp.proponer_fechas_uo_anterior'));

select pg_temp.uo_pendiente('PRUEBA-INICIO-T1', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000d', estado = 'Asignada', fecha_no_antes_de = '2031-03-04'
 where referencia_operativa = 'PRUEBA-INICIO-T1';
reset role;

select pg_temp.verificar('07 fecha futura (martes 2031-03-04) en el mismo UPDATE que la asignacion: carga y los 4 pasos ese dia, origen propuesta',
  (select fecha_no_antes_de = '2031-03-04' from public.unidades_operativas where referencia_operativa = 'PRUEBA-INICIO-T1')
  and pg_temp.carga('PRUEBA-INICIO-T1') = '2031-03-04:0.5'
  and pg_temp.fechas('PRUEBA-INICIO-T1') = '1:2031-03-04,2:2031-03-04,3:2031-03-04,4:2031-03-04'
  and (select bool_and(fecha_origen = 'propuesta') from public.actividades_uo where uo_id = pg_temp.uo('PRUEBA-INICIO-T1')));

select pg_temp.uo_pendiente('PRUEBA-INICIO-T2', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000d', estado = 'Asignada', fecha_no_antes_de = '2031-03-08'
 where referencia_operativa = 'PRUEBA-INICIO-T2';
reset role;

select pg_temp.verificar('08 sabado 2031-03-08: empieza el lunes 2031-03-10',
  pg_temp.carga('PRUEBA-INICIO-T2') = '2031-03-10:0.5'
  and pg_temp.fechas('PRUEBA-INICIO-T2') = '1:2031-03-10,2:2031-03-10,3:2031-03-10,4:2031-03-10');

insert into public.plan_dias_inhabiles (fecha, descripcion) values ('2031-03-12', 'Inhabil de prueba');
select pg_temp.uo_pendiente('PRUEBA-INICIO-T3', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000d', estado = 'Asignada', fecha_no_antes_de = '2031-03-12'
 where referencia_operativa = 'PRUEBA-INICIO-T3';
reset role;

select pg_temp.verificar('09 dia inhabil (miercoles 2031-03-12): lo salta y empieza el jueves 2031-03-13',
  pg_temp.carga('PRUEBA-INICIO-T3') = '2031-03-13:0.5'
  and pg_temp.fechas('PRUEBA-INICIO-T3') = '1:2031-03-13,2:2031-03-13,3:2031-03-13,4:2031-03-13');

select pg_temp.uo_pendiente('PRUEBA-INICIO-T4', 'Aereo', 30);
select pg_temp.uo_pendiente('PRUEBA-INICIO-T5', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000d', estado = 'Asignada', fecha_no_antes_de = '2031-03-17'
 where referencia_operativa = 'PRUEBA-INICIO-T4';
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000d', estado = 'Asignada', fecha_no_antes_de = '2031-03-17'
 where referencia_operativa = 'PRUEBA-INICIO-T5';
reset role;

select pg_temp.verificar('10 dia ya lleno: la primera UO (1.0) llena el lunes 2031-03-17 y la segunda pasa al martes 2031-03-18',
  pg_temp.carga('PRUEBA-INICIO-T4') = '2031-03-17:1'
  and pg_temp.carga('PRUEBA-INICIO-T5') = '2031-03-18:0.5'
  and pg_temp.fechas('PRUEBA-INICIO-T5') = '1:2031-03-18,2:2031-03-18,3:2031-03-18,4:2031-03-18');

select pg_temp.uo_pendiente('PRUEBA-INICIO-T6', 'Subterraneo', 52.5);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000d', estado = 'Asignada', fecha_no_antes_de = '2031-04-11'
 where referencia_operativa = 'PRUEBA-INICIO-T6';
reset role;

select pg_temp.verificar('11 UO larga (3.0) desde viernes 2031-04-11: bloque 0.75 viernes + 0.25 lunes, pulido martes y miercoles, suma 3.0',
  pg_temp.carga('PRUEBA-INICIO-T6') = '2031-04-11:0.75,2031-04-14:0.25,2031-04-15:1,2031-04-16:1'
  and pg_temp.fechas('PRUEBA-INICIO-T6') = '1:2031-04-14,2:2031-04-14,3:2031-04-14,4:2031-04-16'
  and (select sum(jornadas) = 3 from public.plan_carga_uo where uo_id = pg_temp.uo('PRUEBA-INICIO-T6')));

select pg_temp.uo_pendiente('PRUEBA-INICIO-T7', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000d', estado = 'Asignada',
       fecha_no_antes_de = (now() at time zone 'America/Mexico_City')::date - 10
 where referencia_operativa = 'PRUEBA-INICIO-T7';
reset role;

select pg_temp.verificar('12 fecha pasada (hoy - 10): se ignora y queda igual que sin fecha; la columna conserva su valor',
  (select fecha_no_antes_de = pg_temp.hoy() - 10 from public.unidades_operativas where referencia_operativa = 'PRUEBA-INICIO-T7')
  and (select min(fecha) >= pg_temp.hoy() from public.plan_carga_uo where uo_id = pg_temp.uo('PRUEBA-INICIO-T7'))
  and pg_temp.huella(pg_temp.uo('PRUEBA-INICIO-T7'))
      = pg_temp.propuesta_con(pg_temp.uo('PRUEBA-INICIO-T7'), null, null, 'pg_temp.proponer_fechas_uo_anterior'));

savepoint fallo_forzado;
update public.plan_capacidad set jornadas = 0;
select pg_temp.uo_pendiente('PRUEBA-INICIO-T8', 'Aereo', 15);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000d', estado = 'Asignada', fecha_no_antes_de = '2031-05-05'
 where referencia_operativa = 'PRUEBA-INICIO-T8';
reset role;

select pg_temp.verificar('13 fallo forzado (capacidad 0) con fecha: la asignacion y la columna se guardan, actividades sin fecha, sin carga',
  (select estado = 'Asignada' and fecha_no_antes_de = '2031-05-05'
     from public.unidades_operativas where referencia_operativa = 'PRUEBA-INICIO-T8')
  and (select count(*) = 4 and bool_and(fecha_programada is null)
         from public.actividades_uo where uo_id = pg_temp.uo('PRUEBA-INICIO-T8'))
  and not exists (select 1 from public.plan_carga_uo where uo_id = pg_temp.uo('PRUEBA-INICIO-T8')));

rollback to savepoint fallo_forzado;

select pg_temp.verificar('14 tras el rollback del fallo forzado la capacidad vuelve a la semilla',
  public.plan_capacidad_dia('2031-03-03') = 1 and public.plan_capacidad_dia('2031-03-07') = 0.75);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set digitalizador_id = 'e0000000-0000-4000-8000-00000000000c'
 where referencia_operativa = 'PRUEBA-INICIO-T1';
reset role;

select pg_temp.verificar('15 reasignar despues: no se recalcula; mismas fechas y la carga (futura) pasa al nuevo digitalizador',
  pg_temp.fechas('PRUEBA-INICIO-T1') = '1:2031-03-04,2:2031-03-04,3:2031-03-04,4:2031-03-04'
  and pg_temp.carga('PRUEBA-INICIO-T1') = '2031-03-04:0.5'
  and (select bool_and(responsable_id = 'e0000000-0000-4000-8000-00000000000c')
         from public.plan_carga_uo where uo_id = pg_temp.uo('PRUEBA-INICIO-T1'))
  and (select bool_and(fecha_origen = 'propuesta') from public.actividades_uo where uo_id = pg_temp.uo('PRUEBA-INICIO-T1')));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas
   set fecha_no_antes_de = '2031-06-02'
 where referencia_operativa = 'PRUEBA-INICIO-T1';
reset role;

select pg_temp.verificar('16 cambiar la columna despues de asignar: se guarda, pero fechas y carga no cambian',
  (select fecha_no_antes_de = '2031-06-02' from public.unidades_operativas where referencia_operativa = 'PRUEBA-INICIO-T1')
  and pg_temp.fechas('PRUEBA-INICIO-T1') = '1:2031-03-04,2:2031-03-04,3:2031-03-04,4:2031-03-04'
  and pg_temp.carga('PRUEBA-INICIO-T1') = '2031-03-04:0.5');

select pg_temp.uo_sin_plan('PRUEBA-INICIO-N6', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000c');
update public.unidades_operativas set fecha_no_antes_de = '2031-07-08' where referencia_operativa = 'PRUEBA-INICIO-N6';
select public.proponer_fechas_uo(pg_temp.uo('PRUEBA-INICIO-N6'));

select pg_temp.verificar('17 llamada directa proponer_fechas_uo(uo), como el backfill: respeta la columna (martes 2031-07-08)',
  pg_temp.carga('PRUEBA-INICIO-N6') = '2031-07-08:0.5'
  and pg_temp.fechas('PRUEBA-INICIO-N6') = '1:2031-07-08,2:2031-07-08,3:2031-07-08,4:2031-07-08');

select pg_temp.uo_sin_plan('PRUEBA-INICIO-N7', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000c');
select pg_temp.uo_sin_plan('PRUEBA-INICIO-N8', 'Aereo', 15, 'e0000000-0000-4000-8000-00000000000c');
update public.unidades_operativas set fecha_no_antes_de = '2031-08-12' where referencia_operativa = 'PRUEBA-INICIO-N7';
update public.unidades_operativas set fecha_no_antes_de = '2031-08-05' where referencia_operativa = 'PRUEBA-INICIO-N8';
select public.proponer_fechas_uo(pg_temp.uo('PRUEBA-INICIO-N7'), '2031-08-05');
select public.proponer_fechas_uo(pg_temp.uo('PRUEBA-INICIO-N8'), '2031-08-19');

select pg_temp.verificar('18 p_inicio explicito y columna: gana la fecha mayor en los dos sentidos',
  pg_temp.carga('PRUEBA-INICIO-N7') = '2031-08-12:0.5'
  and pg_temp.carga('PRUEBA-INICIO-N8') = '2031-08-19:0.5');

select pg_temp.verificar('19 consistencia final: plan_inconsistencias() vacio',
  not exists (select 1 from public.plan_inconsistencias()));

rollback;

select 'OK: todas las pruebas pasaron (19). Se hizo rollback, no quedaron datos.' as resultado;
