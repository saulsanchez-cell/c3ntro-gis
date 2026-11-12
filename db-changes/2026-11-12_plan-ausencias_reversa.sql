-- Que hace: reversa de 2026-11-12_plan-ausencias: quita plan_ausencias (y sus datos), plan_ausencia_persona y la escritura de feriados desde la app; deja plan_carga_persona como antes; escribe y hace commit.
-- Proyecto: el que se este revirtiendo (SIGOprueba o produccion).
-- ANTES: revertir el frontend que usa plan_ausencias si ya se fusiono.
-- Resultado esperado: sin filas y sin error. Al final plan_carga_persona vuelve a la huella c11dce94a0a74e77ce9f2afd1244d7c7.
-- AVISO: borra todas las ausencias registradas. Antes de correrla, si hace falta conservarlas,
--   guardar el resultado de: select * from public.plan_ausencias order by fecha, profile_id;
-- Los feriados que se hayan agregado desde la app se quedan en plan_dias_inhabiles.
-- Estado: PROPUESTO, NO APLICADO

begin;

-- plan_carga_persona como la dejo la validacion planeada (2026-11-02)
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
$$;

drop function if exists public.plan_ausencia_persona(uuid, date);
drop table if exists public.plan_ausencias;

drop policy if exists plan_dias_inhabiles_insert on public.plan_dias_inhabiles;
drop policy if exists plan_dias_inhabiles_delete on public.plan_dias_inhabiles;
revoke insert, delete on table public.plan_dias_inhabiles from authenticated;

do $$
begin
  if md5(replace(pg_get_functiondef('public.plan_carga_persona(uuid,date)'::regprocedure), E'\r', ''))
       is distinct from 'c11dce94a0a74e77ce9f2afd1244d7c7' then
    raise exception 'plan_carga_persona no quedo con la huella anterior. Se deshace todo.';
  end if;
end $$;

commit;
