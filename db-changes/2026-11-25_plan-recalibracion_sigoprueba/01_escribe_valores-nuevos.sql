-- Que hace: recalibra el plan desde el 2026-11-26: Mixto 35, Subterraneo 35 y Aereo 60 km por jornada, y jornada minima por UO 0.33. Cierra los valores anteriores el 2026-11-25 (no los borra); escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual (ver ../2026-11-25_plan-recalibracion_produccion/README.md).
-- Reversa: db-changes/2026-11-25_plan-recalibracion_valores_reversa.sql
-- Resultado esperado: sin filas y sin error. Si aborta porque los valores vigentes no son los esperados, no queda nada escrito: mandar el mensaje completo.
-- Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-11-25
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-11-25
--
-- Decisiones de Saul (2026-11-25):
--   - El 2026-11-09 se acordo con Gerencia no ajustar la jornada minima hasta tener un mes
--     de plan (arranco el 2026-10-26). Esta es esa calibracion: con los valores iniciales una
--     UO mixta de 75 km daba 15 jornadas (unas 3 semanas) y se subio en 2 dias.
--   - Mixto 35 (antes 5), Subterraneo 35 (antes 17.5), Aereo 60 (antes 30) km por jornada.
--   - Jornada minima por UO 0.33 (antes 0.5): caben 3 UOs cortas por dia (2 el viernes).
--   - Sin cambio: jornadas_pasos_1_3_uo_larga (1.0) y jornadas_validacion_uo (0.5).
--   - Los dias pasados no se tocan: las semanas anteriores quedan con la estimacion inicial.
--
-- Efecto:
--   - Solo en lo que se proponga desde el 2026-11-26 (proponer_fechas_uo usa los valores
--     vigentes el dia de inicio). La carga ya reservada no se recalcula sola.
--   - "Donde asignar" lee jornada_minima_uo de la tabla: cambia solo desde el 2026-11-26.
--   - Con los valores nuevos, una UO de hasta 35 km (mixta o subterranea) o de hasta 60 km
--     (aerea) es "corta" (<= 1 jornada): va completa en un dia.
--   - R4 de plan_inconsistencias() marcara las UOs ya planeadas cuya carga empieza el
--     2026-11-26 o despues (en produccion, la 52). Es solo diagnostico; la app no lo usa.

begin;

do $$
begin
  if (select count(*) from public.plan_rendimientos
       where vigente_hasta is null
         and (metodo_constructivo, km_por_jornada, vigente_desde) in
             (('Aereo', 30, date '2026-01-01'), ('Subterraneo', 17.5, date '2026-01-01'), ('Mixto', 5, date '2026-01-01'))) <> 3
     or (select count(*) from public.plan_rendimientos where vigente_hasta is null) <> 3 then
    raise exception 'Los rendimientos vigentes no son Aereo 30, Subterraneo 17.5 y Mixto 5 desde 2026-01-01. Abortado.';
  end if;
  if not exists (select 1 from public.plan_parametros
                  where clave = 'jornada_minima_uo' and valor = 0.5
                    and vigente_desde = date '2026-01-01' and vigente_hasta is null)
     or (select count(*) from public.plan_parametros
          where clave = 'jornada_minima_uo' and vigente_hasta is null) <> 1 then
    raise exception 'jornada_minima_uo vigente no es 0.5 desde 2026-01-01. Abortado.';
  end if;
  if exists (select 1 from public.plan_rendimientos where vigente_desde >= date '2026-11-26')
     or exists (select 1 from public.plan_parametros
                 where clave = 'jornada_minima_uo' and vigente_desde >= date '2026-11-26') then
    raise exception 'Ya hay valores con vigencia desde el 2026-11-26. Abortado.';
  end if;
end;
$$;

update public.plan_rendimientos
   set vigente_hasta = date '2026-11-25'
 where vigente_hasta is null;

update public.plan_parametros
   set vigente_hasta = date '2026-11-25'
 where clave = 'jornada_minima_uo'
   and vigente_hasta is null;

insert into public.plan_rendimientos (metodo_constructivo, km_por_jornada, vigente_desde) values
  ('Aereo',       60, date '2026-11-26'),
  ('Subterraneo', 35, date '2026-11-26'),
  ('Mixto',       35, date '2026-11-26');

insert into public.plan_parametros (clave, valor, descripcion, vigente_desde) values
  ('jornada_minima_uo', 0.33,
   'Jornadas mínimas de una UO, aunque sus km den menos (recalibrada el 2026-11-25 tras un mes de plan)',
   date '2026-11-26');

commit;
