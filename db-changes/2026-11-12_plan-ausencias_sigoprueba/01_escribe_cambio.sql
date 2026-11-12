-- Que hace: ausencias por persona en el plan semanal (vacaciones, permisos, medios dias) y feriados desde la app; escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual (ver ../2026-11-12_plan-ausencias_produccion/README.md).
-- Reversa: db-changes/2026-11-12_plan-ausencias_reversa.sql (antes, revertir el frontend si ya se fusiono).
-- Resultado esperado: sin filas y sin error. Si aborta porque la base no esta como en el 00, no queda nada escrito: mandar el mensaje completo.
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-11-12
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-11-12 (03 con las mismas huellas; auditoria de seguridad: 0 filas)
-- Huellas tras el cambio: plan_carga_persona 53007a90297d5d35b9718b1f966d7554, plan_ausencia_persona 715a3fcc727396b1fbc11f356f9eba7b
--   (proponer_fechas_uo 77bdbd410611bbd0ab7b03c86dc4ebb3 y proponer_validacion_uo 46f86cfe5391feae38acb7dff95dc9be sin cambios)
--
-- Decisiones de Saul (2026-11-11):
--   - Se registran desde la app; solo el coordinador agrega o quita.
--   - Dia completo (fraccion 1) o medio dia (0.5).
--   - Tipos: Vacaciones, Permiso, Otro; nota corta opcional. La nota la leen
--     todos los usuarios con sesion: no se guardan motivos de salud.
--   - La carga ya programada en un dia de ausencia no se mueve sola: la app
--     avisa y se corrige con REPROGRAMAR (igual que con los feriados).
--   - Los feriados (plan_dias_inhabiles) tambien se agregan y quitan desde la
--     app, solo el coordinador.
--
-- Como entra al plan:
--   plan_ausencia_persona(persona, dia) = fraccion ausente x plan_capacidad_dia(dia)
--   plan_carga_persona(persona, dia) ahora suma esa ausencia a la carga de UOs
--   y de validaciones. Solo la usan proponer_fechas_uo y proponer_validacion_uo
--   (medido el 2026-11-12), que calculan el libre como
--   plan_capacidad_dia - plan_carga_persona: asi saltan el dia completo de
--   ausencia y en medio dia solo usan la mitad. Esas dos funciones NO cambian
--   (sus huellas siguen igual).
--   No cambian plan_capacidad_dia (es de todo el equipo), plan_sumar_dias_habiles
--   ni reprogramar_actividad: la app avisa si la fecha nueva cae en una ausencia.
--
-- Huellas despues del cambio: ver 03_lectura_permisos.sql.

begin;

do $$
begin
  if to_regclass('public.plan_ausencias') is not null then
    raise exception 'plan_ausencias ya existe. Abortado.';
  end if;
  if md5(replace(pg_get_functiondef('public.plan_carga_persona(uuid,date)'::regprocedure), E'\r', ''))
       is distinct from 'c11dce94a0a74e77ce9f2afd1244d7c7' then
    raise exception 'plan_carga_persona no es la de la validacion planeada (md5 distinto). Abortado.';
  end if;
  if md5(replace(pg_get_functiondef('public.es_coordinador()'::regprocedure), E'\r', ''))
       is distinct from '9ed2b30dd261b6d3243aad357c727dad' then
    raise exception 'es_coordinador() no es la de la fase 1 (md5 distinto). Abortado.';
  end if;
  if (select array_agg(policyname::text order by policyname) from pg_policies
       where schemaname = 'public' and tablename = 'plan_dias_inhabiles')
     is distinct from array['plan_dias_inhabiles_select'] then
    raise exception 'plan_dias_inhabiles no tiene solo la politica de lectura, como se midio el 2026-11-12. Abortado.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Ausencias por persona
-- -----------------------------------------------------------------------------

create table public.plan_ausencias (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  fecha      date not null,
  fraccion   numeric not null check (fraccion in (0.5, 1)),
  tipo       text not null check (tipo in ('Vacaciones', 'Permiso', 'Otro')),
  nota       text check (nota is null or char_length(nota) <= 120),
  creado_por uuid references public.profiles(id) default auth.uid(),  -- null si se carga desde el SQL Editor
  created_at timestamptz not null default now(),
  primary key (profile_id, fecha)
);

comment on table public.plan_ausencias is
  'Ausencias por persona y dia en el plan semanal (1 = dia completo, 0.5 = medio dia). Solo el coordinador agrega o quita. La nota la leen todos: sin motivos de salud.';

create index plan_ausencias_fecha_idx on public.plan_ausencias (fecha);

alter table public.plan_ausencias enable row level security;

-- Los default privileges de Supabase dan ALL a anon y authenticated en tablas nuevas.
revoke all on table public.plan_ausencias from public, anon, authenticated;
grant select, insert, delete on table public.plan_ausencias to authenticated;

create policy plan_ausencias_select on public.plan_ausencias
  for select to authenticated using (true);
create policy plan_ausencias_insert on public.plan_ausencias
  for insert to authenticated
  with check (public.es_coordinador() and creado_por = auth.uid());
create policy plan_ausencias_delete on public.plan_ausencias
  for delete to authenticated using (public.es_coordinador());

-- -----------------------------------------------------------------------------
-- Capacidad: la ausencia ocupa su parte del dia
-- -----------------------------------------------------------------------------

create function public.plan_ausencia_persona(p_persona uuid, p_fecha date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((select sum(a.fraccion)
                     from public.plan_ausencias a
                    where a.profile_id = p_persona
                      and a.fecha = p_fecha), 0)
       * public.plan_capacidad_dia(p_fecha)
$$;

revoke all on function public.plan_ausencia_persona(uuid, date) from public, anon, authenticated;

-- Mismo cuerpo que antes mas la ausencia. CREATE OR REPLACE conserva los
-- permisos (ninguno para public, anon ni authenticated).
create or replace function public.plan_carga_persona(p_persona uuid, p_fecha date)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((select sum(c.jornadas)
                     from public.plan_carga_uo c
                    where c.responsable_id = p_persona
                      and c.fecha = p_fecha), 0)
       + coalesce((select sum(c.jornadas)
                     from public.plan_carga_actividad c
                    where c.responsable_id = p_persona
                      and c.fecha = p_fecha), 0)
       + public.plan_ausencia_persona(p_persona, p_fecha)
$$;

-- -----------------------------------------------------------------------------
-- Feriados desde la app (solo el coordinador)
-- -----------------------------------------------------------------------------

grant insert, delete on table public.plan_dias_inhabiles to authenticated;

create policy plan_dias_inhabiles_insert on public.plan_dias_inhabiles
  for insert to authenticated with check (public.es_coordinador());
create policy plan_dias_inhabiles_delete on public.plan_dias_inhabiles
  for delete to authenticated using (public.es_coordinador());

commit;
