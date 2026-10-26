-- =============================================================================
-- *** SOLO SIGOPRUEBA, NUNCA PRODUCCION ***
-- *** PROPUESTO, NO APLICADO ***
--
-- Datos de ejemplo para probar en el frontend la sección "Actividades" de FichaUO.
-- A diferencia del script de pruebas, este SÍ hace commit.
--
-- Corrido en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD  <-- completar
--
-- Requisitos:
--   1. Haber aplicado 2026-10-23_actividades-uo.sql.
--   2. Crear en SIGOprueba (Authentication > Users > Add user) dos usuarios:
--      un digitalizador y un coordinador. Pegar sus UUID abajo, en _seed_usuarios.
--      Si no se reemplazan, el script falla al convertir el texto a uuid.
--
-- Limitación: marcar como coordinador en el frontend solo funciona con el UUID
-- fijo de es_coordinador() (7063db07-...), y en Supabase no se puede elegir el
-- UUID al crear un usuario. El coordinador de este seed puede asignar UOs
-- (FichaUO usa profiles.rol para eso) pero NO marcar actividades ajenas.
-- Ese camino ya lo cubre el script de pruebas.
--
-- Deja:
--   SEED-ACT-001  Pendiente, sin digitalizador -> para asignar desde la UI y
--                 ver que se generan las 4 actividades.
--   SEED-ACT-002  Asignada hace 2 días: 1 marcada normal, 1 registrada tarde,
--                 2 pendientes.
--   SEED-ACT-003  En Proceso sin actividades -> la sección no debe mostrarse.
--                 (Si después corres el rescate opcional, esta UO también recibe
--                 actividades y deja de servir para esa prueba.)
--
-- Limpieza (borra las UOs y por cascada sus actividades y eventos):
--   delete from public.unidades_operativas where referencia_operativa like 'SEED-ACT-%';
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.actividades_uo') is null then
    raise exception 'Primero aplica 2026-10-23_actividades-uo.sql';
  end if;
  -- Salvaguarda: SIGOprueba no tiene UOs reales. Si las hay, no es SIGOprueba.
  if exists (select 1 from public.unidades_operativas
              where referencia_operativa not like 'SEED-ACT-%'
                and referencia_operativa not like 'PRUEBA-ACT-%') then
    raise exception 'Hay UOs reales en esta base: esto no parece SIGOprueba. Abortado.';
  end if;
  if exists (select 1 from public.unidades_operativas where referencia_operativa like 'SEED-ACT-%') then
    raise exception 'El seed ya se aplico. Corre la limpieza del encabezado antes de repetirlo.';
  end if;
end $$;

create temp table _seed_usuarios (clave text primary key, id uuid not null) on commit drop;
insert into _seed_usuarios values
  ('digitalizador', 'PEGAR_UUID_DIGITALIZADOR'),
  ('coordinador',   'PEGAR_UUID_COORDINADOR');

insert into public.profiles (id, nombre, iniciales, rol)
select id, 'Seed Digitalizador', 'SD', 'digitalizador' from _seed_usuarios where clave = 'digitalizador'
on conflict (id) do nothing;

insert into public.profiles (id, nombre, iniciales, rol)
select id, 'Seed Coordinador', 'SC', 'coordinador' from _seed_usuarios where clave = 'coordinador'
on conflict (id) do nothing;

insert into public.unidades_operativas (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo) values
  ('SEED-ACT-001', 'Seed · pendiente de asignar',      'Baseline', 'Pendiente',  'Aereo'),
  ('SEED-ACT-002', 'Seed · asignada con avance',       'Baseline', 'Pendiente',  'Subterraneo'),
  ('SEED-ACT-003', 'Seed · en proceso sin actividades', 'Baseline', 'En Proceso', 'Mixto');

-- SEED-ACT-002: asignar (el trigger genera las actividades) y moverla 2 días atrás.
update public.unidades_operativas
   set digitalizador_id = (select id from _seed_usuarios where clave = 'digitalizador'),
       estado = 'Asignada',
       fecha_asignacion = (now() at time zone 'America/Mexico_City')::date - 2
 where referencia_operativa = 'SEED-ACT-002';

update public.actividades_uo a
   set created_at = now() - interval '2 days'
  from public.unidades_operativas u
 where u.id = a.uo_id and u.referencia_operativa = 'SEED-ACT-002';

-- Marcar como el digitalizador, por las RPC, para que los eventos queden igual que en la UI.
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from _seed_usuarios where clave = 'digitalizador'), 'role', 'authenticated')::text,
  true);

select public.marcar_actividad(a.id)
  from public.actividades_uo a join public.unidades_operativas u on u.id = a.uo_id
 where u.referencia_operativa = 'SEED-ACT-002' and a.orden = 1;

select public.marcar_actividad(a.id, now() - interval '1 day', 'Ejemplo de registro tardio del seed')
  from public.actividades_uo a join public.unidades_operativas u on u.id = a.uo_id
 where u.referencia_operativa = 'SEED-ACT-002' and a.orden = 2;

select set_config('request.jwt.claims', '', true);

commit;

select u.referencia_operativa, u.estado, a.orden, a.nombre, a.completada_en, a.registrada_tarde
  from public.unidades_operativas u
  left join public.actividades_uo a on a.uo_id = u.id
 where u.referencia_operativa like 'SEED-ACT-%'
 order by 1, 3;
