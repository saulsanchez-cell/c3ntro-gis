-- Que hace: pruebas del trigger "nadie se autovalida" (8) dentro de begin ... rollback, con perfiles y UOs ficticias; no deja datos.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Solo despues del 06. No se corre en produccion.
-- Resultado esperado: 1 fila "OK: todas las pruebas pasaron (8)". Si una falla, el script se detiene con "FALLO <n> ..." y no queda nada: mandar el mensaje completo.
-- Corrido en SIGOprueba el 2026-11-02: OK (8), en la segunda corrida (la primera fallo por un error de la prueba 02, ya corregido)
--
-- Para simular una UO vieja con analista = digitalizador (como las 8 de
-- produccion), la prueba 02 desactiva el trigger de INSERT solo dentro de esta
-- transaccion; el rollback lo deja como estaba.

begin;

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.unidades_operativas'::regclass
                    and tgname = 'trg_analista_distinto_update') then
    raise exception 'Primero corre 06_escribe_check-no-autovalidacion.sql';
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

-- true si la sentencia falla con el mensaje del trigger; false si pasa
create function pg_temp.rechaza(p_sql text)
returns boolean language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when check_violation then
    if sqlerrm = 'El analista QA no puede ser el mismo digitalizador (nadie se autovalida)' then
      return true;
    end if;
    raise exception 'Error distinto: %', sqlerrm;
  end;
  return false;
end $$;

insert into public.profiles (id, nombre, iniciales, rol) values
  ('e3000000-0000-4000-8000-000000000001', 'Prueba Auto D1', 'PA1', 'digitalizador'),
  ('e3000000-0000-4000-8000-000000000002', 'Prueba Auto D2', 'PA2', 'digitalizador');

select pg_temp.verificar('01 dos triggers, funcion con search_path vacio, no SECURITY DEFINER, sin EXECUTE; el check viejo ya no existe',
  (select count(*) = 2 from pg_trigger
    where tgrelid = 'public.unidades_operativas'::regclass
      and tgname in ('trg_analista_distinto_insert', 'trg_analista_distinto_update'))
  and (select not prosecdef and coalesce(proconfig @> array['search_path=""'], false)
         from pg_proc where oid = 'public.validar_analista_distinto_uo()'::regprocedure)
  and not has_function_privilege('public', 'public.validar_analista_distinto_uo()', 'execute')
  and not has_function_privilege('anon', 'public.validar_analista_distinto_uo()', 'execute')
  and not has_function_privilege('authenticated', 'public.validar_analista_distinto_uo()', 'execute')
  and not exists (select 1 from pg_constraint
                   where conrelid = 'public.unidades_operativas'::regclass
                     and conname = 'unidades_operativas_analista_distinto_digitalizador_check'));

alter table public.unidades_operativas disable trigger trg_analista_distinto_insert;
insert into public.unidades_operativas
  (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo, km_teoricos, digitalizador_id, analista_qa_id)
values ('PRUEBA-AUTO-VIEJA', 'Proyecto de prueba PRUEBA-AUTO-VIEJA', 'Baseline', 'Validada', 'Aereo', 15,
        'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001');
alter table public.unidades_operativas enable trigger trg_analista_distinto_insert;

-- La lectura va en otra sentencia: dentro de la misma, la consulta no ve lo
-- que escribio pg_temp.rechaza (la foto de los datos es del inicio de la sentencia).
select pg_temp.verificar('02a UO vieja con analista = digitalizador: pasar a Cerrada no se rechaza',
  not pg_temp.rechaza($q$update public.unidades_operativas set estado = 'Cerrada'
                          where referencia_operativa = 'PRUEBA-AUTO-VIEJA'$q$));

select pg_temp.verificar('02 UO vieja con analista = digitalizador: quedo Cerrada',
  (select estado = 'Cerrada' from public.unidades_operativas where referencia_operativa = 'PRUEBA-AUTO-VIEJA'));

select pg_temp.verificar('03 UO vieja: guardar como FichaUO (los dos campos con el mismo valor) no falla',
  not pg_temp.rechaza($q$update public.unidades_operativas
                            set digitalizador_id = 'e3000000-0000-4000-8000-000000000001',
                                analista_qa_id   = 'e3000000-0000-4000-8000-000000000001',
                                observaciones    = 'Prueba'
                          where referencia_operativa = 'PRUEBA-AUTO-VIEJA'$q$));

insert into public.unidades_operativas
  (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo, km_teoricos, digitalizador_id, analista_qa_id)
values ('PRUEBA-AUTO-NUEVA', 'Proyecto de prueba PRUEBA-AUTO-NUEVA', 'Baseline', 'Pendiente', 'Aereo', 15,
        'e3000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000002');

select pg_temp.verificar('04 poner como analista al digitalizador: se rechaza con el mensaje',
  pg_temp.rechaza($q$update public.unidades_operativas set analista_qa_id = 'e3000000-0000-4000-8000-000000000001'
                      where referencia_operativa = 'PRUEBA-AUTO-NUEVA'$q$));

select pg_temp.verificar('05 poner como digitalizador al analista: se rechaza con el mensaje',
  pg_temp.rechaza($q$update public.unidades_operativas set digitalizador_id = 'e3000000-0000-4000-8000-000000000002'
                      where referencia_operativa = 'PRUEBA-AUTO-NUEVA'$q$));

select pg_temp.verificar('06 crear una UO con la misma persona en los dos campos: se rechaza con el mensaje',
  pg_temp.rechaza($q$insert into public.unidades_operativas
                       (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo, km_teoricos, digitalizador_id, analista_qa_id)
                     values ('PRUEBA-AUTO-MAL', 'Proyecto de prueba PRUEBA-AUTO-MAL', 'Baseline', 'Pendiente', 'Aereo', 15,
                             'e3000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000002')$q$)
  and not exists (select 1 from public.unidades_operativas where referencia_operativa = 'PRUEBA-AUTO-MAL'));

select pg_temp.verificar('07 vacios: sin analista o sin los dos se permite',
  not pg_temp.rechaza($q$update public.unidades_operativas set analista_qa_id = null
                          where referencia_operativa = 'PRUEBA-AUTO-NUEVA'$q$)
  and not pg_temp.rechaza($q$update public.unidades_operativas set digitalizador_id = null
                              where referencia_operativa = 'PRUEBA-AUTO-NUEVA'$q$));

select pg_temp.verificar('08a cambio normal (analista distinto del digitalizador) no se rechaza',
  not pg_temp.rechaza($q$update public.unidades_operativas
                            set digitalizador_id = 'e3000000-0000-4000-8000-000000000001',
                                analista_qa_id   = 'e3000000-0000-4000-8000-000000000002'
                          where referencia_operativa = 'PRUEBA-AUTO-NUEVA'$q$));

select pg_temp.verificar('08 cambio normal: quedo guardado',
  (select digitalizador_id = 'e3000000-0000-4000-8000-000000000001'
          and analista_qa_id = 'e3000000-0000-4000-8000-000000000002'
     from public.unidades_operativas where referencia_operativa = 'PRUEBA-AUTO-NUEVA'));

select 'OK: todas las pruebas pasaron (8)' as resultado;

rollback;
