-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- PRUEBAS de 2026-10-23_proteger-km-teoricos-endurecer.sql. Solo para SIGOprueba.
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
--   COORD 7063db07-ed16-4ca5-8c98-53b63d128702  coordinador (UUID de proteger_km_teoricos)
--   UO    c0000000-0000-4000-8000-0000000000c2  km_teoricos inicial = 10
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from pg_trigger
                  where tgname = 'trg_proteger_km_teoricos'
                    and tgrelid = 'public.unidades_operativas'::regclass) then
    raise exception 'No existe trg_proteger_km_teoricos en unidades_operativas';
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

-- Como debe_fallar de las pruebas de actividades-uo, pero además exige el
-- error esperado. p_sqlstate o p_mensaje en null = no se revisa.
create function pg_temp.debe_fallar_con(p_prueba text, p_sql text, p_sqlstate text, p_mensaje text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if (p_sqlstate is not null and sqlstate is distinct from p_sqlstate)
       or (p_mensaje is not null and sqlerrm is distinct from p_mensaje) then
      raise exception 'FALLO % (fallo con otro error: % %)', p_prueba, sqlstate, sqlerrm;
    end if;
    raise notice 'OK   % -> %', p_prueba, sqlerrm;
    return;
  end;
  raise exception 'FALLO % (debia fallar y no fallo)', p_prueba;
end $$;

create function pg_temp.km()
returns numeric language sql as $$
  select km_teoricos from public.unidades_operativas
   where id = 'c0000000-0000-4000-8000-0000000000c2'
$$;

-- -----------------------------------------------------------------------------
-- Datos de prueba (como postgres)
-- -----------------------------------------------------------------------------

insert into public.profiles (id, nombre, iniciales, rol) values
  ('a0000000-0000-4000-8000-00000000000a', 'Prueba Digitalizador A', 'PA', 'digitalizador')
on conflict (id) do nothing;

insert into public.profiles (id, nombre, iniciales, rol) values
  ('7063db07-ed16-4ca5-8c98-53b63d128702', 'Prueba Coordinador', 'PC', 'coordinador')
on conflict (id) do nothing;

insert into public.unidades_operativas (id, referencia_operativa, nombre, tipo_proyecto, estado, km_teoricos) values
  ('c0000000-0000-4000-8000-0000000000c2', 'PRUEBA-KM-001', 'UO de prueba km_teoricos', 'Baseline', 'Pendiente', 10);

-- -----------------------------------------------------------------------------
-- Caso (1): authenticated que no es el coordinador no cambia km_teoricos
-- -----------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select pg_temp.debe_fallar_con('01 A cambia km_teoricos',
  $q$ update public.unidades_operativas set km_teoricos = 20
       where id = 'c0000000-0000-4000-8000-0000000000c2' $q$,
  null, 'No tienes permiso para modificar km_teoricos');
select pg_temp.debe_fallar_con('02 A cambia km_teoricos junto con otra columna',
  $q$ update public.unidades_operativas set km_teoricos = 20, observaciones = 'intento'
       where id = 'c0000000-0000-4000-8000-0000000000c2' $q$,
  null, 'No tienes permiso para modificar km_teoricos');
select pg_temp.verificar('03 km_teoricos sigue en 10 tras los intentos de A', pg_temp.km() = 10);

-- authenticated sin "sub": auth.uid() es null
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select pg_temp.debe_fallar_con('04 authenticated sin sub cambia km_teoricos',
  $q$ update public.unidades_operativas set km_teoricos = 20
       where id = 'c0000000-0000-4000-8000-0000000000c2' $q$,
  null, 'No tienes permiso para modificar km_teoricos');

-- -----------------------------------------------------------------------------
-- Caso (2): el coordinador sí puede
-- -----------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);

update public.unidades_operativas set km_teoricos = 20
 where id = 'c0000000-0000-4000-8000-0000000000c2';
select pg_temp.verificar('05 COORD cambia km_teoricos de 10 a 20', pg_temp.km() = 20);

-- -----------------------------------------------------------------------------
-- Caso (3): otras columnas sin tocar km_teoricos, cualquiera puede
-- -----------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);

update public.unidades_operativas set observaciones = 'Cambio de A'
 where id = 'c0000000-0000-4000-8000-0000000000c2';
select pg_temp.verificar('06 A cambia observaciones',
  (select observaciones = 'Cambio de A' and km_teoricos = 20
     from public.unidades_operativas where id = 'c0000000-0000-4000-8000-0000000000c2'));

-- Mandar km_teoricos con el mismo valor no cuenta como cambio.
update public.unidades_operativas set km_teoricos = 20, observaciones = 'Cambio de A con km igual'
 where id = 'c0000000-0000-4000-8000-0000000000c2';
select pg_temp.verificar('07 A manda km_teoricos sin cambiarlo junto con otra columna',
  (select observaciones = 'Cambio de A con km igual' and km_teoricos = 20
     from public.unidades_operativas where id = 'c0000000-0000-4000-8000-0000000000c2'));

-- -----------------------------------------------------------------------------
-- Caso (4): anon no puede ejecutar la función vía RPC
-- -----------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);

-- has_function_privilege considera también lo heredado de public.
select pg_temp.verificar('08 anon sin EXECUTE',
  not has_function_privilege('anon', 'public.proteger_km_teoricos()', 'execute'));
select pg_temp.verificar('09 authenticated sin EXECUTE',
  not has_function_privilege('authenticated', 'public.proteger_km_teoricos()', 'execute'));

-- PostgREST llama la RPC como el rol anon. Se exige 42501 (permiso denegado):
-- antes del cambio la llamada también falla, pero con 0A000 ("trigger
-- functions can only be called as triggers"), así que esta prueba distingue.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select pg_temp.debe_fallar_con('10 anon llama proteger_km_teoricos',
  $q$ select public.proteger_km_teoricos() $q$,
  '42501', null);

-- -----------------------------------------------------------------------------
-- Caso (5): search_path vacío
-- -----------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);

select pg_temp.verificar('11 proconfig contiene search_path=""',
  (select proconfig @> array['search_path=""'] from pg_proc
    where oid = 'public.proteger_km_teoricos()'::regprocedure));
select pg_temp.verificar('12 sigue siendo SECURITY DEFINER',
  (select prosecdef from pg_proc where oid = 'public.proteger_km_teoricos()'::regprocedure));
select pg_temp.verificar('13 trg_proteger_km_teoricos sigue habilitado',
  (select tgenabled = 'O' from pg_trigger
    where tgname = 'trg_proteger_km_teoricos'
      and tgrelid = 'public.unidades_operativas'::regclass));

rollback;

select 'OK: todas las pruebas pasaron (13). Se hizo rollback, no quedaron datos.' as resultado;
