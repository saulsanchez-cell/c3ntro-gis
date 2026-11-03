-- Que hace: pruebas de la fase 1 de politicas por rol (14) dentro de begin ... rollback, con perfiles, UO, version e item ficticios y SET LOCAL ROLE + request.jwt.claims; no deja datos.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Solo despues de 01. No se corre en produccion.
-- Resultado esperado: 1 fila "OK: todas las pruebas pasaron (14)". Si una falla, el script se detiene con "FALLO <n> ..." y no queda nada: mandar el mensaje completo.
-- Corrido en SIGOprueba el 2026-11-03: OK (14)
--
-- Perfiles ficticios:
--   C   e5000000-0000-4000-8000-0000000000c0  coordinador activo
--   CI  e5000000-0000-4000-8000-0000000000c1  coordinador INACTIVO
--   A   e5000000-0000-4000-8000-0000000000a0  analista QA de la UO de prueba
--   D   e5000000-0000-4000-8000-0000000000d0  digitalizador de la UO de prueba
--   S   e5000000-0000-4000-8000-0000000000e0  cuenta de apoyo, sin relacion con la UO

begin;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'logs_actividad'
                   and policyname = 'logs_insert') then
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

insert into public.profiles (id, nombre, iniciales, rol, activo) values
  ('e5000000-0000-4000-8000-0000000000c0', 'Prueba Rol C',  'PRC', 'coordinador',   true),
  ('e5000000-0000-4000-8000-0000000000c1', 'Prueba Rol CI', 'PRI', 'coordinador',   false),
  ('e5000000-0000-4000-8000-0000000000a0', 'Prueba Rol A',  'PRA', 'digitalizador', true),
  ('e5000000-0000-4000-8000-0000000000d0', 'Prueba Rol D',  'PRD', 'digitalizador', true),
  ('e5000000-0000-4000-8000-0000000000e0', 'Prueba Rol S',  'PRS', 'digitalizador', true);

insert into public.unidades_operativas (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo, km_teoricos, digitalizador_id, analista_qa_id)
values ('PRUEBA-ROL-1', 'Proyecto de prueba PRUEBA-ROL-1', 'Baseline', 'En Validacion', 'Aereo', 15,
        'e5000000-0000-4000-8000-0000000000d0', 'e5000000-0000-4000-8000-0000000000a0');

insert into public.checklist_versiones (id, version, descripcion, activa)
values ('e5000000-0000-4000-8000-0000000000f0', 'prueba-rol', 'Version de prueba', false);
insert into public.checklist_items (id, version_id, seccion, nombre)
values ('e5000000-0000-4000-8000-0000000000f1', 'e5000000-0000-4000-8000-0000000000f0', 'General', 'Item de prueba');

select pg_temp.verificar('01 es_coordinador(): SECURITY DEFINER, search_path vacio, EXECUTE solo para authenticated',
  (select prosecdef and coalesce(proconfig @> array['search_path=""'], false)
     from pg_proc where oid = 'public.es_coordinador()'::regprocedure)
  and has_function_privilege('authenticated', 'public.es_coordinador()', 'execute')
  and not has_function_privilege('anon', 'public.es_coordinador()', 'execute')
  and not has_function_privilege('public', 'public.es_coordinador()', 'execute'));

select pg_temp.verificar('02 sin sesion es_coordinador() es false',
  public.es_coordinador() = false);

select pg_temp.verificar('03 politicas: las 8 abiertas ya no existen; la unica de escritura abierta que queda es unidades_operativas.auth_all_uo',
  (select array_agg(p.tablename || '.' || p.policyname)
     from pg_policies p
    where p.schemaname = 'public' and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and coalesce(p.qual, 'true') = 'true' and coalesce(p.with_check, 'true') = 'true')
  = array['unidades_operativas.auth_all_uo']);

-- ---------------------------------------------------------------------------
-- es_coordinador() por rol
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000c0","role":"authenticated"}', true);
do $$ begin
  if not public.es_coordinador() then raise exception 'FALLO 04 el coordinador activo no es coordinador'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
do $$ begin
  if public.es_coordinador() then raise exception 'FALLO 04 un coordinador inactivo cuenta como coordinador'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000d0","role":"authenticated"}', true);
do $$ begin
  if public.es_coordinador() then raise exception 'FALLO 04 un digitalizador cuenta como coordinador'; end if;
  raise notice 'OK   04 es_coordinador(): si para el coordinador activo; no para el inactivo ni para un digitalizador';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- historial_estados
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000d0","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  insert into public.historial_estados (uo_id, usuario_id, estado_anterior, estado_nuevo)
  select id, 'e5000000-0000-4000-8000-0000000000d0', 'En Proceso', 'En Validacion'
    from public.unidades_operativas where referencia_operativa = 'PRUEBA-ROL-1';
  raise notice 'OK   05 historial: D inserta con su propio usuario';

  begin
    insert into public.historial_estados (uo_id, usuario_id, estado_nuevo)
    select id, 'e5000000-0000-4000-8000-0000000000a0', 'Validada'
      from public.unidades_operativas where referencia_operativa = 'PRUEBA-ROL-1';
    raise exception 'FALLO 06 D inserto historial a nombre de A';
  exception when insufficient_privilege then
    raise notice 'OK   06 historial: no se puede insertar a nombre de otro';
  end;

  update public.historial_estados set nota = 'cambiada'
   where uo_id = (select id from public.unidades_operativas where referencia_operativa = 'PRUEBA-ROL-1');
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO 07 D edito el historial'; end if;
  delete from public.historial_estados
   where uo_id = (select id from public.unidades_operativas where referencia_operativa = 'PRUEBA-ROL-1');
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO 07 D borro el historial'; end if;
  raise notice 'OK   07 historial: nadie edita ni borra (0 filas)';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- checklist_borradores, checklist_resultados, checklist_respuestas
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000a0","role":"authenticated"}', true);
do $$
begin
  insert into public.checklist_borradores (uo_id, usuario_id, respuestas)
  select id, 'e5000000-0000-4000-8000-0000000000a0', '{}'::jsonb
    from public.unidades_operativas where referencia_operativa = 'PRUEBA-ROL-1';

  insert into public.checklist_resultados (id, uo_id, version_id, analista_id, resultado)
  select 'e5000000-0000-4000-8000-0000000000f2', id, 'e5000000-0000-4000-8000-0000000000f0',
         'e5000000-0000-4000-8000-0000000000a0', 'Aprobado'
    from public.unidades_operativas where referencia_operativa = 'PRUEBA-ROL-1';

  insert into public.checklist_respuestas (resultado_id, item_id, puntos_esperados, puntos_conformes)
  values ('e5000000-0000-4000-8000-0000000000f2', 'e5000000-0000-4000-8000-0000000000f1', 1, 1);
  raise notice 'OK   08 el analista QA de la UO guarda su borrador, su resultado y sus respuestas';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000d0","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  select count(*) into v_n from public.checklist_borradores where usuario_id = 'e5000000-0000-4000-8000-0000000000a0';
  if v_n <> 0 then raise exception 'FALLO 09 D ve el borrador de A'; end if;
  delete from public.checklist_borradores where usuario_id = 'e5000000-0000-4000-8000-0000000000a0';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO 09 D borro el borrador de A'; end if;
  raise notice 'OK   09 borradores: D no ve ni borra el de A';

  begin
    insert into public.checklist_resultados (uo_id, version_id, analista_id, resultado)
    select id, 'e5000000-0000-4000-8000-0000000000f0', 'e5000000-0000-4000-8000-0000000000d0', 'Aprobado'
      from public.unidades_operativas where referencia_operativa = 'PRUEBA-ROL-1';
    raise exception 'FALLO 10 D (no es el analista) guardo un resultado';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.checklist_respuestas (resultado_id, item_id)
    values ('e5000000-0000-4000-8000-0000000000f2', 'e5000000-0000-4000-8000-0000000000f1');
    raise exception 'FALLO 10 D agrego respuestas al resultado de A';
  exception when insufficient_privilege then null;
  end;
  update public.checklist_resultados set resultado = 'Rechazado' where id = 'e5000000-0000-4000-8000-0000000000f2';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO 10 D edito el resultado de A'; end if;
  raise notice 'OK   10 checklist: D no guarda resultados de una UO donde no es analista, ni toca los de A';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000a0","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  update public.checklist_resultados set resultado = 'Rechazado' where id = 'e5000000-0000-4000-8000-0000000000f2';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO 11 A edito su resultado ya guardado'; end if;
  raise notice 'OK   11 checklist: un resultado guardado solo lo edita el coordinador (A: 0 filas)';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- logs_actividad
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000e0","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  -- Cuenta de apoyo: registra (y re-registra, como el upsert de FichaUO) su log en una UO ajena
  insert into public.logs_actividad (uo_id, usuario_id, fecha, porcentaje_avance, fase)
  select id, 'e5000000-0000-4000-8000-0000000000e0', '2031-03-03', 40, 'Preparacion'
    from public.unidades_operativas where referencia_operativa = 'PRUEBA-ROL-1';
  update public.logs_actividad set porcentaje_avance = 60
   where usuario_id = 'e5000000-0000-4000-8000-0000000000e0' and fecha = '2031-03-03';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FALLO 12 la cuenta de apoyo no pudo editar su propio log'; end if;
  raise notice 'OK   12 logs: la cuenta de apoyo registra y edita su log en una UO ajena';

  begin
    insert into public.logs_actividad (uo_id, usuario_id, fecha, porcentaje_avance, fase)
    select id, 'e5000000-0000-4000-8000-0000000000d0', '2031-03-04', 10, 'Preparacion'
      from public.unidades_operativas where referencia_operativa = 'PRUEBA-ROL-1';
    raise exception 'FALLO 13 S registro un log a nombre de D';
  exception when insufficient_privilege then null;
  end;
  delete from public.logs_actividad where usuario_id = 'e5000000-0000-4000-8000-0000000000e0';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO 13 S borro su log'; end if;
  raise notice 'OK   13 logs: nadie escribe a nombre de otro, y solo el coordinador borra';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Coordinador (por rol, no es el UUID fijo) y catalogos
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000d0","role":"authenticated"}', true);
do $$
declare v_n int;
begin
  begin
    insert into public.catalogo_observaciones_qa (familia, categoria) values ('Prueba', 'Prueba');
    raise exception 'FALLO 14 D escribio en el catalogo';
  exception when insufficient_privilege then null;
  end;
  update public.checklist_items set nombre = 'Cambiado' where id = 'e5000000-0000-4000-8000-0000000000f1';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO 14 D edito un item del checklist'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"e5000000-0000-4000-8000-0000000000c0","role":"authenticated"}', true);
do $$
declare v_a int; v_b int; v_c int; v_d int;
begin
  insert into public.catalogo_observaciones_qa (familia, categoria) values ('Prueba', 'Prueba');
  update public.checklist_items set nombre = 'Item editado' where id = 'e5000000-0000-4000-8000-0000000000f1';
  get diagnostics v_a = row_count;
  update public.checklist_resultados set resultado = 'Rechazado' where id = 'e5000000-0000-4000-8000-0000000000f2';
  get diagnostics v_b = row_count;
  delete from public.logs_actividad where usuario_id = 'e5000000-0000-4000-8000-0000000000e0';
  get diagnostics v_c = row_count;
  select count(*) into v_d from public.checklist_borradores;  -- el coordinador solo ve los suyos
  if v_a <> 1 or v_b <> 1 or v_c <> 1 then
    raise exception 'FALLO 14 el coordinador por rol no pudo editar item (%), resultado (%) o borrar log (%)', v_a, v_b, v_c;
  end if;
  raise notice 'OK   14 catalogos solo para el coordinador; el coordinador por rol (sin UUID fijo) edita y borra';
end $$;
reset role;

select 'OK: todas las pruebas pasaron (14)' as resultado;

rollback;
