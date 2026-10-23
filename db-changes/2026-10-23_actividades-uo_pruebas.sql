-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- PRUEBAS de 2026-10-23_actividades-uo.sql. Solo para SIGOprueba.
--
-- Corrido en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD  <-- completar
--
-- Todo corre dentro de una transacción que termina en ROLLBACK: no deja datos.
-- Simula usuarios con SET LOCAL ROLE + request.jwt.claims (auth.uid() lee "sub").
--
-- Cómo leer el resultado:
--   - Si alguna prueba falla, el script se detiene con un error "FALLO <n> ...".
--     Nada queda guardado.
--   - Si todo pasa, la última consulta devuelve "OK: todas las pruebas pasaron".
--   - En psql además se ve un NOTICE "OK <n> ..." por cada prueba.
--
-- Usuarios de prueba:
--   A     a0000000-0000-4000-8000-00000000000a  digitalizador
--   B     b0000000-0000-4000-8000-00000000000b  digitalizador
--   COORD 7063db07-ed16-4ca5-8c98-53b63d128702  coordinador (UUID de es_coordinador)
--   UO    c0000000-0000-4000-8000-0000000000c1
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.actividades_uo') is null then
    raise exception 'Primero aplica 2026-10-23_actividades-uo.sql';
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

create function pg_temp.debe_fallar(p_prueba text, p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK   % -> %', p_prueba, sqlerrm;
    return;
  end;
  raise exception 'FALLO % (debia fallar y no fallo)', p_prueba;
end $$;

-- id de la actividad de la UO de prueba por orden
create function pg_temp.act(p_orden int)
returns uuid language sql as $$
  select id from public.actividades_uo
   where uo_id = 'c0000000-0000-4000-8000-0000000000c1' and orden = p_orden
$$;

create function pg_temp.fila(p_orden int)
returns public.actividades_uo language sql as $$
  select * from public.actividades_uo
   where uo_id = 'c0000000-0000-4000-8000-0000000000c1' and orden = p_orden
$$;

-- -----------------------------------------------------------------------------
-- Datos de prueba (como postgres)
-- -----------------------------------------------------------------------------

insert into public.profiles (id, nombre, iniciales, rol) values
  ('a0000000-0000-4000-8000-00000000000a', 'Prueba Digitalizador A', 'PA', 'digitalizador'),
  ('b0000000-0000-4000-8000-00000000000b', 'Prueba Digitalizador B', 'PB', 'digitalizador');

insert into public.profiles (id, nombre, iniciales, rol) values
  ('7063db07-ed16-4ca5-8c98-53b63d128702', 'Prueba Coordinador', 'PC', 'coordinador')
on conflict (id) do nothing;

insert into public.unidades_operativas (id, referencia_operativa, nombre, tipo_proyecto, estado) values
  ('c0000000-0000-4000-8000-0000000000c1', 'PRUEBA-ACT-001', 'UO de prueba actividades', 'Baseline', 'Pendiente');

-- -----------------------------------------------------------------------------
-- Generación al asignar (como coordinador, authenticated)
-- -----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);

select pg_temp.verificar('01 es_coordinador() = true para COORD', public.es_coordinador());

-- Igual que guardarAsignacion en FichaUO: digitalizador y estado en el mismo UPDATE.
update public.unidades_operativas
   set digitalizador_id = 'a0000000-0000-4000-8000-00000000000a',
       estado = 'Asignada',
       fecha_asignacion = current_date
 where id = 'c0000000-0000-4000-8000-0000000000c1';

select pg_temp.verificar('02 asignar genera 4 actividades',
  (select count(*) from public.actividades_uo where uo_id = 'c0000000-0000-4000-8000-0000000000c1') = 4);
select pg_temp.verificar('03 las 4 son de digitalizador, responsable A, ronda 1, pendientes',
  (select bool_and(rol_responsable = 'digitalizador'
                   and responsable_id = 'a0000000-0000-4000-8000-00000000000a'
                   and ronda = 1 and completada_en is null)
     from public.actividades_uo where uo_id = 'c0000000-0000-4000-8000-0000000000c1'));
select pg_temp.verificar('04 plantillas inactivas no generan actividades',
  not exists (select 1 from public.actividades_uo a
                join public.plantillas_actividad p on p.id = a.plantilla_id
               where a.uo_id = 'c0000000-0000-4000-8000-0000000000c1' and not p.activa));

update public.unidades_operativas set estado = 'Asignada'   where id = 'c0000000-0000-4000-8000-0000000000c1';
update public.unidades_operativas set estado = 'En Proceso' where id = 'c0000000-0000-4000-8000-0000000000c1';
update public.unidades_operativas set estado = 'Asignada'   where id = 'c0000000-0000-4000-8000-0000000000c1';

select pg_temp.verificar('05 re-asignar no duplica (siguen 4)',
  (select count(*) from public.actividades_uo where uo_id = 'c0000000-0000-4000-8000-0000000000c1') = 4);

-- Asignación "hace 3 días" para poder probar horas pasadas válidas.
reset role;
update public.actividades_uo set created_at = now() - interval '3 days'
 where uo_id = 'c0000000-0000-4000-8000-0000000000c1';

-- -----------------------------------------------------------------------------
-- Marcar (como A, responsable)
-- -----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select pg_temp.verificar('06 es_coordinador() = false para A', not public.es_coordinador());

select public.marcar_actividad(pg_temp.act(1));
select pg_temp.verificar('07 marcar autorizado sin hora usa now() del servidor',
  (select completada_en = now() and registrada_en = now() and completada_por = 'a0000000-0000-4000-8000-00000000000a'
          and not registrada_tarde and motivo_ajuste is null
     from pg_temp.fila(1)));
select pg_temp.verificar('08 marcar escribe evento marcar',
  (select count(*) = 1 and bool_and(evento = 'marcar' and valor_anterior is null and valor_nuevo = now()
                                     and usuario_id = 'a0000000-0000-4000-8000-00000000000a')
     from public.actividades_uo_eventos where actividad_id = pg_temp.act(1)));

select pg_temp.debe_fallar('09 marcar una actividad ya completada',
  $q$ select public.marcar_actividad(pg_temp.act(1)) $q$);
select pg_temp.debe_fallar('10 hora anterior sin motivo',
  $q$ select public.marcar_actividad(pg_temp.act(2), now() - interval '1 day', null) $q$);
select pg_temp.debe_fallar('11 hora anterior con motivo corto',
  $q$ select public.marcar_actividad(pg_temp.act(2), now() - interval '1 day', '  corto   ') $q$);
select pg_temp.debe_fallar('12 hora futura',
  $q$ select public.marcar_actividad(pg_temp.act(2), now() + interval '1 hour', 'Motivo de prueba valido') $q$);
select pg_temp.debe_fallar('13 hora anterior a la asignacion',
  $q$ select public.marcar_actividad(pg_temp.act(2), now() - interval '4 days', 'Motivo de prueba valido') $q$);

select public.marcar_actividad(pg_temp.act(2), now() - interval '1 day', '  Se me olvido marcarla ayer  ');
select pg_temp.verificar('14 hora anterior valida: registrada_tarde y motivo',
  (select completada_en = now() - interval '1 day' and registrada_en = now() and registrada_tarde
          and motivo_ajuste = 'Se me olvido marcarla ayer'
     from pg_temp.fila(2)));

-- Sin escritura directa
select pg_temp.debe_fallar('15 UPDATE directo en actividades_uo',
  $q$ update public.actividades_uo set completada_en = now() where id = pg_temp.act(3) $q$);
select pg_temp.debe_fallar('16 INSERT directo en actividades_uo',
  $q$ insert into public.actividades_uo (uo_id, plantilla_id, nombre, orden, rol_responsable)
      select uo_id, plantilla_id, nombre, 99, rol_responsable from pg_temp.fila(1) $q$);
select pg_temp.debe_fallar('17 DELETE directo en actividades_uo',
  $q$ delete from public.actividades_uo where id = pg_temp.act(3) $q$);
select pg_temp.debe_fallar('18 UPDATE en eventos como authenticated',
  $q$ update public.actividades_uo_eventos set motivo = 'alterado' $q$);
select pg_temp.debe_fallar('19 DELETE en eventos como authenticated',
  $q$ delete from public.actividades_uo_eventos $q$);
select pg_temp.debe_fallar('20 INSERT directo en eventos',
  $q$ insert into public.actividades_uo_eventos (actividad_id, usuario_id, evento)
      values (pg_temp.act(3), 'a0000000-0000-4000-8000-00000000000a', 'marcar') $q$);

-- -----------------------------------------------------------------------------
-- Sin permiso (como B)
-- -----------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);

select pg_temp.debe_fallar('21 marcar sin permiso',
  $q$ select public.marcar_actividad(pg_temp.act(3)) $q$);
select pg_temp.debe_fallar('22 desmarcar sin permiso',
  $q$ select public.desmarcar_actividad(pg_temp.act(1), 'Motivo de prueba valido') $q$);
select pg_temp.debe_fallar('23 ajustar hora sin permiso',
  $q$ select public.ajustar_hora_actividad(pg_temp.act(1), now() - interval '1 day', 'Motivo de prueba valido') $q$);

-- -----------------------------------------------------------------------------
-- Coordinador marca una actividad ajena
-- -----------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);

select public.marcar_actividad(pg_temp.act(3));
select pg_temp.verificar('24 coordinador marca actividad de A',
  (select completada_por = '7063db07-ed16-4ca5-8c98-53b63d128702' from pg_temp.fila(3)));

-- -----------------------------------------------------------------------------
-- Desmarcar y ajustar hora (como A)
-- -----------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select pg_temp.debe_fallar('25 desmarcar sin motivo',
  $q$ select public.desmarcar_actividad(pg_temp.act(1), null) $q$);
select pg_temp.debe_fallar('26 desmarcar con motivo en blanco',
  $q$ select public.desmarcar_actividad(pg_temp.act(1), '              ') $q$);
select pg_temp.debe_fallar('27 desmarcar una pendiente',
  $q$ select public.desmarcar_actividad(pg_temp.act(4), 'Motivo de prueba valido') $q$);

select public.desmarcar_actividad(pg_temp.act(1), 'La marque por error');
select pg_temp.verificar('28 desmarcar limpia la actividad',
  (select completada_en is null and completada_por is null and registrada_en is null
          and not registrada_tarde and motivo_ajuste is null
     from pg_temp.fila(1)));
select pg_temp.verificar('29 desmarcar escribe evento con valor anterior',
  exists (select 1 from public.actividades_uo_eventos
           where actividad_id = pg_temp.act(1) and evento = 'desmarcar'
             and valor_anterior = now() and valor_nuevo is null and motivo = 'La marque por error'));

select pg_temp.debe_fallar('30 ajustar hora de una pendiente',
  $q$ select public.ajustar_hora_actividad(pg_temp.act(1), now() - interval '1 day', 'Motivo de prueba valido') $q$);
select pg_temp.debe_fallar('31 ajustar hora sin motivo',
  $q$ select public.ajustar_hora_actividad(pg_temp.act(3), now() - interval '1 day', null) $q$);
select pg_temp.debe_fallar('32 ajustar a hora futura',
  $q$ select public.ajustar_hora_actividad(pg_temp.act(3), now() + interval '1 hour', 'Motivo de prueba valido') $q$);
select pg_temp.debe_fallar('33 ajustar a hora anterior a la asignacion',
  $q$ select public.ajustar_hora_actividad(pg_temp.act(3), now() - interval '4 days', 'Motivo de prueba valido') $q$);

select public.ajustar_hora_actividad(pg_temp.act(3), now() - interval '2 days', 'La termine antier en realidad');
select pg_temp.verificar('34 ajustar hora: nueva hora, registrada_tarde, conserva completada_por',
  (select completada_en = now() - interval '2 days' and registrada_tarde
          and completada_por = '7063db07-ed16-4ca5-8c98-53b63d128702'
          and motivo_ajuste = 'La termine antier en realidad'
     from pg_temp.fila(3)));
select pg_temp.verificar('35 ajustar hora escribe evento ajustar_hora',
  exists (select 1 from public.actividades_uo_eventos
           where actividad_id = pg_temp.act(3) and evento = 'ajustar_hora'
             and valor_anterior = now() and valor_nuevo = now() - interval '2 days'
             and usuario_id = 'a0000000-0000-4000-8000-00000000000a'));

-- -----------------------------------------------------------------------------
-- Reasignación de digitalizador
-- Estado ahora: 1 pendiente, 2 completada (A), 3 completada (COORD), 4 pendiente
-- -----------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);

update public.unidades_operativas set digitalizador_id = 'b0000000-0000-4000-8000-00000000000b'
 where id = 'c0000000-0000-4000-8000-0000000000c1';

select pg_temp.verificar('36 reasignar pasa las pendientes a B',
  (select (select responsable_id from pg_temp.fila(1)) = 'b0000000-0000-4000-8000-00000000000b'
      and (select responsable_id from pg_temp.fila(4)) = 'b0000000-0000-4000-8000-00000000000b'));
select pg_temp.verificar('37 reasignar no toca las completadas',
  (select (select responsable_id from pg_temp.fila(2)) = 'a0000000-0000-4000-8000-00000000000a'
      and (select responsable_id from pg_temp.fila(3)) = 'a0000000-0000-4000-8000-00000000000a'));

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select pg_temp.debe_fallar('38 A ya no puede marcar tras la reasignacion',
  $q$ select public.marcar_actividad(pg_temp.act(4)) $q$);

select set_config('request.jwt.claims', '{"sub":"b0000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select public.marcar_actividad(pg_temp.act(4));
select pg_temp.verificar('39 B marca tras la reasignacion',
  (select completada_por = 'b0000000-0000-4000-8000-00000000000b' from pg_temp.fila(4)));

-- Pendiente con responsable nulo
reset role;
update public.actividades_uo set responsable_id = null where id = pg_temp.act(1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
update public.unidades_operativas set digitalizador_id = 'a0000000-0000-4000-8000-00000000000a'
 where id = 'c0000000-0000-4000-8000-0000000000c1';

select pg_temp.verificar('40 reasignar llena responsable nulo y no toca la completada por B',
  (select (select responsable_id from pg_temp.fila(1)) = 'a0000000-0000-4000-8000-00000000000a'
      and (select responsable_id from pg_temp.fila(4)) = 'b0000000-0000-4000-8000-00000000000b'));

-- -----------------------------------------------------------------------------
-- Eventos inmutables incluso para postgres
-- -----------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.debe_fallar('41 UPDATE en eventos como postgres (trigger)',
  $q$ update public.actividades_uo_eventos set motivo = 'alterado' $q$);
select pg_temp.debe_fallar('42 TRUNCATE de eventos como postgres (trigger)',
  $q$ truncate public.actividades_uo_eventos $q$);
select pg_temp.verificar('43 total de eventos = 6 (marcar x4, desmarcar, ajustar_hora)',
  (select count(*) from public.actividades_uo_eventos e
     join public.actividades_uo a on a.id = e.actividad_id
    where a.uo_id = 'c0000000-0000-4000-8000-0000000000c1') = 6);

-- -----------------------------------------------------------------------------
-- anon sin acceso
-- -----------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pg_temp.debe_fallar('44 anon lee actividades_uo',
  $q$ select * from public.actividades_uo $q$);
select pg_temp.debe_fallar('45 anon lee actividades_uo_eventos',
  $q$ select * from public.actividades_uo_eventos $q$);
select pg_temp.debe_fallar('46 anon lee plantillas_actividad',
  $q$ select * from public.plantillas_actividad $q$);
select pg_temp.debe_fallar('47 anon llama marcar_actividad',
  $q$ select public.marcar_actividad(gen_random_uuid()) $q$);
select pg_temp.debe_fallar('48 anon llama desmarcar_actividad',
  $q$ select public.desmarcar_actividad(gen_random_uuid(), 'Motivo de prueba valido') $q$);
select pg_temp.debe_fallar('49 anon llama ajustar_hora_actividad',
  $q$ select public.ajustar_hora_actividad(gen_random_uuid(), now(), 'Motivo de prueba valido') $q$);
select pg_temp.debe_fallar('50 anon llama es_coordinador',
  $q$ select public.es_coordinador() $q$);

reset role;
rollback;

select 'OK: todas las pruebas pasaron (50). Se hizo rollback, no quedaron datos.' as resultado;
