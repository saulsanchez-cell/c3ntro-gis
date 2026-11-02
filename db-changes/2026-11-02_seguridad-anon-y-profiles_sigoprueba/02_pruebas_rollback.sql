-- Que hace: pruebas del cierre de anon y de las politicas de profiles (12) dentro de begin ... rollback, con perfiles ficticios y SET LOCAL ROLE + request.jwt.claims; no deja datos.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Solo despues de 01. No se corre en produccion.
-- Resultado esperado: 1 fila "OK: todas las pruebas pasaron (12)". Si una falla, el script se detiene con "FALLO <n> ..." y no queda nada: mandar el mensaje completo.
-- Corrido en SIGOprueba el 2026-11-02: OK (12)
--
-- Perfiles ficticios: D1 e4000000-0000-4000-8000-000000000001 y
-- D2 e4000000-0000-4000-8000-000000000002 (digitalizadores).

begin;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
                   and policyname = 'profiles_update') then
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
  ('e4000000-0000-4000-8000-000000000001', 'Prueba Seg D1', 'PS1', 'digitalizador'),
  ('e4000000-0000-4000-8000-000000000002', 'Prueba Seg D2', 'PS2', 'digitalizador');

insert into public.profiles (id, nombre, iniciales, rol) values
  ('7063db07-ed16-4ca5-8c98-53b63d128702', 'Prueba Coordinador', 'PC', 'coordinador')
on conflict (id) do nothing;

select pg_temp.verificar('01 anon y public sin ningun privilegio en las 13 tablas viejas',
  (select bool_and(not has_table_privilege(r, 'public.' || t, 'select, insert, update, delete, truncate, references, trigger'))
     from (values ('catalogo_observaciones_qa'), ('checklist_borradores'), ('checklist_items'), ('checklist_respuestas'),
                  ('checklist_resultados'), ('checklist_versiones'), ('historial_estados'), ('log_distancia'),
                  ('logs_actividad'), ('metas_proyecto'), ('profiles'), ('transiciones_permitidas'), ('unidades_operativas')) as x(t)
     cross join (values ('anon'), ('public')) as y(r)));

select pg_temp.verificar('02 authenticated conserva SELECT, INSERT, UPDATE y DELETE y ya no tiene TRUNCATE, REFERENCES ni TRIGGER',
  (select bool_and(has_table_privilege('authenticated', 'public.' || t, 'select')
                   and has_table_privilege('authenticated', 'public.' || t, 'insert')
                   and has_table_privilege('authenticated', 'public.' || t, 'update')
                   and has_table_privilege('authenticated', 'public.' || t, 'delete')
                   and not has_table_privilege('authenticated', 'public.' || t, 'truncate, references, trigger'))
     from (values ('catalogo_observaciones_qa'), ('checklist_borradores'), ('checklist_items'), ('checklist_respuestas'),
                  ('checklist_resultados'), ('checklist_versiones'), ('historial_estados'), ('log_distancia'),
                  ('logs_actividad'), ('metas_proyecto'), ('profiles'), ('transiciones_permitidas'), ('unidades_operativas')) as x(t)));

select pg_temp.verificar('03 politicas: read_catalogo y read_transiciones TO authenticated; profiles con 4 politicas y sin auth_all_profiles; ninguna politica para public o anon',
  (select roles = '{authenticated}' from pg_policies where policyname = 'read_catalogo' and tablename = 'catalogo_observaciones_qa')
  and (select roles = '{authenticated}' from pg_policies where policyname = 'read_transiciones' and tablename = 'transiciones_permitidas')
  and (select count(*) = 4 and bool_and(roles = '{authenticated}')
         from pg_policies where schemaname = 'public' and tablename = 'profiles'
          and policyname in ('profiles_select', 'profiles_insert', 'profiles_update', 'profiles_delete'))
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'auth_all_profiles')
  and not exists (select 1 from pg_policies where schemaname = 'public' and roles && array['public', 'anon']::name[]));

set local role anon;
do $$
begin
  begin
    perform 1 from public.transiciones_permitidas limit 1;
  exception when insufficient_privilege then
    raise notice 'OK   04 anon no puede leer transiciones_permitidas (permiso denegado)';
    return;
  end;
  raise exception 'FALLO 04 anon pudo leer transiciones_permitidas';
end $$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.profiles limit 1;
  exception when insufficient_privilege then
    raise notice 'OK   05 anon no puede leer profiles (permiso denegado)';
    return;
  end;
  raise exception 'FALLO 05 anon pudo leer profiles';
end $$;
reset role;

-- Como D1 (digitalizador)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"e4000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare
  v_perfiles int;
  v_catalogo int;
  v_n int;
begin
  select count(*) into v_perfiles from public.profiles;
  select count(*) into v_catalogo from public.transiciones_permitidas;
  if v_perfiles < 3 then
    raise exception 'FALLO 06 D1 solo ve % perfiles', v_perfiles;
  end if;
  raise notice 'OK   06 con sesion se siguen leyendo profiles (%) y transiciones_permitidas (%)', v_perfiles, v_catalogo;

  update public.profiles set rol = 'coordinador' where id = 'e4000000-0000-4000-8000-000000000001';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO 07 D1 cambio su propio rol'; end if;
  raise notice 'OK   07 D1 no puede cambiarse el rol (0 filas)';

  update public.profiles set nombre = 'Cambiado', activo = false where id = '7063db07-ed16-4ca5-8c98-53b63d128702';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO 08 D1 cambio el perfil del coordinador'; end if;
  raise notice 'OK   08 D1 no puede cambiar el nombre ni activo de otro (0 filas)';

  delete from public.profiles where id = 'e4000000-0000-4000-8000-000000000002';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLO 09 D1 borro un perfil'; end if;
  raise notice 'OK   09 D1 no puede borrar perfiles (0 filas)';

  begin
    insert into public.profiles (id, nombre, iniciales, rol)
    values ('e4000000-0000-4000-8000-000000000003', 'Intruso', 'INT', 'coordinador');
    raise exception 'FALLO 10 D1 creo un perfil';
  exception when insufficient_privilege then
    raise notice 'OK   10 D1 no puede crear perfiles (RLS)';
  end;

  begin
    truncate public.transiciones_permitidas;
    raise exception 'FALLO 11 authenticated pudo hacer TRUNCATE';
  exception when insufficient_privilege then
    raise notice 'OK   11 authenticated no puede hacer TRUNCATE';
  end;
end $$;
reset role;

select pg_temp.verificar('07-09 despues: D1 sigue digitalizador, el coordinador sin cambios y D2 existe',
  (select rol = 'digitalizador' from public.profiles where id = 'e4000000-0000-4000-8000-000000000001')
  and (select activo is distinct from false and nombre <> 'Cambiado' from public.profiles where id = '7063db07-ed16-4ca5-8c98-53b63d128702')
  and exists (select 1 from public.profiles where id = 'e4000000-0000-4000-8000-000000000002'));

-- Como coordinador
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"7063db07-ed16-4ca5-8c98-53b63d128702","role":"authenticated"}', true);
do $$
declare
  v_n int;
  v_m int;
begin
  update public.profiles set nombre = 'Prueba Seg D1 editado' where id = 'e4000000-0000-4000-8000-000000000001';
  get diagnostics v_n = row_count;
  delete from public.profiles where id = 'e4000000-0000-4000-8000-000000000002';
  get diagnostics v_m = row_count;
  if v_n <> 1 or v_m <> 1 then
    raise exception 'FALLO 12 el coordinador no pudo editar (%) o borrar (%)', v_n, v_m;
  end if;
  raise notice 'OK   12 el coordinador si puede editar y borrar perfiles';
end $$;
reset role;

select 'OK: todas las pruebas pasaron (12)' as resultado;

rollback;
