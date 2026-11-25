-- Que hace: prueba el 01 (valores nuevos) y deshace todo al final (rollback). Solo lee funciones del plan; no crea UOs.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Se puede correr tambien en produccion: no escribe nada que quede.
-- Resultado esperado: mensajes OK 01 a 04 en la pestana de mensajes; sin error.

begin;

do $$
begin
  -- 01 el 2026-11-25 siguen los valores anteriores
  if public.plan_rendimiento('Mixto', date '2026-11-25') <> 5
     or public.plan_rendimiento('Subterraneo', date '2026-11-25') <> 17.5
     or public.plan_rendimiento('Aereo', date '2026-11-25') <> 30
     or public.plan_parametro('jornada_minima_uo', date '2026-11-25') <> 0.5 then
    raise exception 'FALLO 01 el 2026-11-25 los valores no son los anteriores';
  end if;
  raise notice 'OK   01 hasta el 2026-11-25: Mixto 5, Subterraneo 17.5, Aereo 30, minima 0.5';

  -- 02 desde el 2026-11-26 rigen los nuevos
  if public.plan_rendimiento('Mixto', date '2026-11-26') <> 35
     or public.plan_rendimiento('Subterraneo', date '2026-11-26') <> 35
     or public.plan_rendimiento('Aereo', date '2026-11-26') <> 60
     or public.plan_parametro('jornada_minima_uo', date '2026-11-26') <> 0.33 then
    raise exception 'FALLO 02 desde el 2026-11-26 los valores no son los nuevos';
  end if;
  raise notice 'OK   02 desde el 2026-11-26: Mixto 35, Subterraneo 35, Aereo 60, minima 0.33';

  -- 03 sin cambio en los otros parametros
  if public.plan_parametro('jornadas_pasos_1_3_uo_larga', date '2026-11-26') <> 1.0
     or public.plan_parametro('jornadas_validacion_uo', date '2026-11-26') <> 0.5 then
    raise exception 'FALLO 03 cambiaron jornadas_pasos_1_3_uo_larga o jornadas_validacion_uo';
  end if;
  raise notice 'OK   03 bloque 1 a 3 sigue en 1.0 y validacion en 0.5';

  -- 04 un solo valor vigente por metodo y por parametro en cualquier fecha
  if exists (select 1 from public.plan_rendimientos a
               join public.plan_rendimientos b
                 on b.metodo_constructivo = a.metodo_constructivo and b.id <> a.id
              where daterange(a.vigente_desde, coalesce(a.vigente_hasta, 'infinity'), '[]')
                 && daterange(b.vigente_desde, coalesce(b.vigente_hasta, 'infinity'), '[]'))
     or exists (select 1 from public.plan_parametros a
                  join public.plan_parametros b
                    on b.clave = a.clave and b.vigente_desde <> a.vigente_desde
                 where daterange(a.vigente_desde, coalesce(a.vigente_hasta, 'infinity'), '[]')
                    && daterange(b.vigente_desde, coalesce(b.vigente_hasta, 'infinity'), '[]')) then
    raise exception 'FALLO 04 hay vigencias que se enciman';
  end if;
  raise notice 'OK   04 sin vigencias encimadas';
end;
$$;

rollback;
