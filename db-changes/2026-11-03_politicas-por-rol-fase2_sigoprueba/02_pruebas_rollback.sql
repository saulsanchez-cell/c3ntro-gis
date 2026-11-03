-- Que hace: pruebas de la fase 2 de politicas por rol (14) dentro de begin ... rollback, con perfiles y UOs ficticios y SET LOCAL ROLE + request.jwt.claims; no deja datos.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Solo despues de 01. No se corre en produccion.
-- Resultado esperado: 1 fila "OK: todas las pruebas pasaron (14)". Si una falla, el script se detiene con "FALLO <n> ..." y no queda nada: mandar el mensaje completo.
-- Corrido en SIGOprueba el 2026-11-03: OK (14)
--
-- Perfiles ficticios:
--   C  e6000000-0000-4000-8000-0000000000c0  coordinador
--   D  e6000000-0000-4000-8000-0000000000d0  digitalizador de la UO
--   A  e6000000-0000-4000-8000-0000000000a0  analista QA de la UO
--   S  e6000000-0000-4000-8000-0000000000e0  cuenta de apoyo (tiene un log en la UO)
--   X  e6000000-0000-4000-8000-0000000000f0  sin relacion con la UO
-- Las pruebas con sesion van en bloques DO (corren con el rol activo, sin pg_temp).

begin;

do $$
begin
  if to_regprocedure('public.proteger_columnas_uo()') is null then
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

insert into public.profiles (id, nombre, iniciales, rol) values
  ('e6000000-0000-4000-8000-0000000000c0', 'Prueba F2 C', 'P2C', 'coordinador'),
  ('e6000000-0000-4000-8000-0000000000d0', 'Prueba F2 D', 'P2D', 'digitalizador'),
  ('e6000000-0000-4000-8000-0000000000a0', 'Prueba F2 A', 'P2A', 'digitalizador'),
  ('e6000000-0000-4000-8000-0000000000e0', 'Prueba F2 S', 'P2S', 'digitalizador'),
  ('e6000000-0000-4000-8000-0000000000f0', 'Prueba F2 X', 'P2X', 'digitalizador');

insert into public.unidades_operativas (referencia_operativa, nombre, tipo_proyecto, estado, prioridad, metodo_constructivo, km_teoricos, digitalizador_id, analista_qa_id)
values ('PRUEBA-F2-1', 'Proyecto de prueba PRUEBA-F2-1', 'Baseline', 'En Proceso', 'P3', 'Aereo', 15,
        'e6000000-0000-4000-8000-0000000000d0', 'e6000000-0000-4000-8000-0000000000a0'),
       ('PRUEBA-F2-2', 'Proyecto de prueba PRUEBA-F2-2', 'Baseline', 'Pendiente', 'P3', 'Aereo', 15, null, null);

insert into public.logs_actividad (uo_id, usuario_id, fecha, porcentaje_avance, fase)
select id, 'e6000000-0000-4000-8000-0000000000e0', '2031-03-03', 30, 'Preparacion'
  from public.unidades_operativas where referencia_operativa = 'PRUEBA-F2-1';

select pg_temp.verificar('01 politicas: auth_all_uo ya no existe; uo_select, uo_insert, uo_update y uo_delete; ninguna politica de escritura abierta en todo public',
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'unidades_operativas' and policyname = 'auth_all_uo')
  and (select count(*) = 4 from pg_policies where schemaname = 'public' and tablename = 'unidades_operativas'
        and policyname in ('uo_select', 'uo_insert', 'uo_update', 'uo_delete') and roles = '{authenticated}')
  and not exists (select 1 from pg_policies p
                   where p.schemaname = 'public' and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                     and coalesce(p.qual, 'true') = 'true' and coalesce(p.with_check, 'true') = 'true'));

select pg_temp.verificar('02 proteger_columnas_uo: search_path vacio, sin EXECUTE para nadie, trigger BEFORE UPDATE',
  (select coalesce(proconfig @> array['search_path=""'], false) from pg_proc where oid = 'public.proteger_columnas_uo()'::regprocedure)
  and not has_function_privilege('authenticated', 'public.proteger_columnas_uo()', 'execute')
  and not has_function_privilege('anon', 'public.proteger_columnas_uo()', 'execute')
  and exists (select 1 from pg_trigger where tgname = 'trg_proteger_columnas_uo' and tgrelid = 'public.unidades_operativas'::regclass));

-- ---------------------------------------------------------------------------
-- D: digitalizador de la UO
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-4000-8000-0000000000d0","role":"authenticated"}', true);
do $$
declare v int;
begin
  begin
    insert into public.unidades_operativas (referencia_operativa, nombre, tipo_proyecto, estado)
    values ('PRUEBA-F2-NUEVA', 'x', 'Baseline', 'Pendiente');
    raise exception 'FALLO 03 D creo una UO';
  exception when insufficient_privilege then
    raise notice 'OK   03 D no puede crear una UO (solo el coordinador)';
  end;

  delete from public.unidades_operativas where referencia_operativa = 'PRUEBA-F2-1';
  get diagnostics v = row_count;
  if v <> 0 then raise exception 'FALLO 04 D borro una UO'; end if;
  raise notice 'OK   04 D no puede borrar una UO (0 filas)';

  update public.unidades_operativas set estado = 'En Validacion', fecha_carga_final = '2031-03-05', dias_proceso = 2
   where referencia_operativa = 'PRUEBA-F2-1';
  get diagnostics v = row_count;
  if v <> 1 then raise exception 'FALLO 05 D no pudo cambiar estado y fechas de su UO'; end if;
  raise notice 'OK   05 D cambia estado y fechas de su UO';

  begin
    update public.unidades_operativas set prioridad = 'P1' where referencia_operativa = 'PRUEBA-F2-1';
    raise exception 'FALLO 06 D cambio la prioridad';
  exception when insufficient_privilege then
    if sqlerrm not like '%prioridad%' then raise exception 'FALLO 06 mensaje sin la columna: %', sqlerrm; end if;
  end;
  begin
    update public.unidades_operativas set digitalizador_id = 'e6000000-0000-4000-8000-0000000000f0'
     where referencia_operativa = 'PRUEBA-F2-1';
    raise exception 'FALLO 06 D cambio el digitalizador';
  exception when insufficient_privilege then
    if sqlerrm not like '%digitalizador_id%' then raise exception 'FALLO 06 mensaje sin la columna: %', sqlerrm; end if;
  end;
  raise notice 'OK   06 D no puede cambiar la prioridad ni el digitalizador (el mensaje dice la columna)';

  -- Como FichaUO: todas las columnas sin cambio, mas un estado nuevo
  update public.unidades_operativas
     set digitalizador_id = digitalizador_id, analista_qa_id = analista_qa_id, prioridad = prioridad,
         metodo_constructivo = metodo_constructivo, estado = 'En Proceso', no_revision = coalesce(no_revision, 0) + 1
   where referencia_operativa = 'PRUEBA-F2-1';
  get diagnostics v = row_count;
  if v <> 1 then raise exception 'FALLO 07 el UPDATE estilo FichaUO no se guardo'; end if;
  raise notice 'OK   07 como FichaUO: columnas sin cambio no cuentan';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- A: analista QA de la UO (lo que guarda el checklist)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-4000-8000-0000000000a0","role":"authenticated"}', true);
do $$
declare v int;
begin
  update public.unidades_operativas set estado = 'Validada', resultado_checklist = 0.98, no_revision = 2
   where referencia_operativa = 'PRUEBA-F2-1';
  get diagnostics v = row_count;
  if v <> 1 then raise exception 'FALLO 08 A no pudo guardar el resultado del checklist'; end if;
  raise notice 'OK   08 A guarda estado, resultado_checklist y no_revision';

  begin
    update public.unidades_operativas set tipo_validacion = 'conectividad_externa' where referencia_operativa = 'PRUEBA-F2-1';
    raise exception 'FALLO 09 A cambio un campo del cierre';
  exception when insufficient_privilege then
    raise notice 'OK   09 A no puede tocar los campos del cierre';
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- S: cuenta de apoyo con log en la UO
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-4000-8000-0000000000e0","role":"authenticated"}', true);
do $$
declare v int;
begin
  update public.unidades_operativas set fecha_inicio_real = '2031-03-03', dias_proceso = 3
   where referencia_operativa = 'PRUEBA-F2-1';
  get diagnostics v = row_count;
  if v <> 1 then raise exception 'FALLO 10 S no pudo actualizar las fechas del avance'; end if;
  raise notice 'OK   10 S actualiza las fechas del avance de una UO ajena donde tiene log';

  begin
    update public.unidades_operativas set estado = 'Cerrada' where referencia_operativa = 'PRUEBA-F2-1';
    raise exception 'FALLO 11 S cambio el estado';
  exception when insufficient_privilege then null;
  end;
  update public.unidades_operativas set dias_proceso = 9 where referencia_operativa = 'PRUEBA-F2-2';
  get diagnostics v = row_count;
  if v <> 0 then raise exception 'FALLO 11 S edito una UO donde no tiene log'; end if;
  raise notice 'OK   11 S no cambia el estado, y en una UO sin log suyo no afecta filas';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- X: sin relacion
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-4000-8000-0000000000f0","role":"authenticated"}', true);
do $$
declare v int; w int;
begin
  update public.unidades_operativas set dias_proceso = 9 where referencia_operativa like 'PRUEBA-F2-%';
  get diagnostics v = row_count;
  delete from public.unidades_operativas where referencia_operativa like 'PRUEBA-F2-%';
  get diagnostics w = row_count;
  if v <> 0 or w <> 0 then raise exception 'FALLO 12 X edito (%) o borro (%)', v, w; end if;
  raise notice 'OK   12 X no edita ni borra nada (0 filas)';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- C: coordinador por rol
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e6000000-0000-4000-8000-0000000000c0","role":"authenticated"}', true);
do $$
declare a int; b int; c int;
begin
  insert into public.unidades_operativas (referencia_operativa, nombre, tipo_proyecto, estado)
  values ('PRUEBA-F2-3', 'Proyecto de prueba PRUEBA-F2-3', 'Baseline', 'Pendiente');
  get diagnostics a = row_count;
  update public.unidades_operativas set prioridad = 'P1', analista_qa_id = 'e6000000-0000-4000-8000-0000000000e0'
   where referencia_operativa = 'PRUEBA-F2-1';
  get diagnostics b = row_count;
  delete from public.unidades_operativas where referencia_operativa = 'PRUEBA-F2-2';
  get diagnostics c = row_count;
  if a <> 1 or b <> 1 or c <> 1 then raise exception 'FALLO 13 el coordinador no pudo crear (%), editar (%) o borrar (%)', a, b, c; end if;
  raise notice 'OK   13 el coordinador crea, asigna y borra UOs';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Sin sesion (SQL Editor)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
update public.unidades_operativas set prioridad = 'P2', observaciones = 'editado en el SQL Editor'
 where referencia_operativa = 'PRUEBA-F2-1';
select pg_temp.verificar('14 sin sesion (SQL Editor) se puede cambiar cualquier columna',
  (select prioridad = 'P2' and observaciones = 'editado en el SQL Editor'
     from public.unidades_operativas where referencia_operativa = 'PRUEBA-F2-1'));

select 'OK: todas las pruebas pasaron (14)' as resultado;

rollback;
