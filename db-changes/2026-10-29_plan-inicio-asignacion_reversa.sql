-- =============================================================================
-- *** PROPUESTO, NO APLICADO ***
-- REVERSA de 2026-10-29_plan-inicio-asignacion (fecha_no_antes_de).
-- El cambio está en 2026-10-29_plan-inicio-asignacion_sigoprueba/01_escribe_cambio.sql.
--
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD  <-- completar
-- Aplicado en producción (rtwjwfpaturmbmegwtys): AAAA-MM-DD  <-- completar
--
-- ANTES DE CORRERLA HAY QUE REVERTIR EL FRONTEND. Si FichaUO sigue mandando
-- fecha_no_antes_de cuando la columna ya no existe, el UPDATE de la asignación
-- entera falla (no se guarda digitalizador, estado ni fecha de asignación).
--
-- Orden dentro del script (la versión nueva de proponer_fechas_uo lee la columna):
--   1. proponer_fechas_uo vuelve al cuerpo de 2026-10-26_plan-semanal.sql,
--      copiado tal cual del archivo. CREATE OR REPLACE conserva dueño y permisos;
--      el REVOKE se repite por seguridad.
--   2. DROP COLUMN unidades_operativas.fecha_no_antes_de.
--
-- ATENCIÓN: borra los valores de la columna. Las fechas y la carga ya
-- propuestas no cambian. El NOTICE dice cuántas UOs tenían valor.
--
-- Verificación después (cada una en su propia consulta):
--   select md5(replace(pg_get_functiondef('public.proponer_fechas_uo(uuid,date)'::regprocedure), E'\r', ''));
--     -> 5a907348c2626b4c083433688c99b686 (la huella medida el 2026-10-29 en SIGOprueba)
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and table_name = 'unidades_operativas' and column_name = 'fecha_no_antes_de';
--     -> 0
--   select * from public.plan_inconsistencias();
--     -> 0 filas
-- =============================================================================

begin;

do $$
declare
  v_con_valor int;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'unidades_operativas'
                    and column_name = 'fecha_no_antes_de') then
    raise exception 'La columna unidades_operativas.fecha_no_antes_de no existe: no hay nada que revertir. Abortado.';
  end if;
  execute 'select count(*) from public.unidades_operativas where fecha_no_antes_de is not null' into v_con_valor;
  raise notice 'Reversa: % UOs tenian fecha_no_antes_de; ese valor se pierde.', v_con_valor;
end $$;

create or replace function public.proponer_fechas_uo(p_uo uuid, p_inicio date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_dias constant int := 366;
  v_inicio   date := coalesce(p_inicio, public.plan_hoy());
  v_uo       record;
  v_minimo   numeric;
  v_bloque   numeric;
  v_total    numeric;
  v_dia      date;
  v_libre    numeric;
  v_tomar    numeric;
  v_restante numeric;
  v_fin_1_3  date;
  v_ultimo   date;
  v_iter     int := 0;
begin
  select u.id, u.referencia_operativa, u.digitalizador_id, u.metodo_constructivo, u.km_teoricos
    into v_uo
    from public.unidades_operativas u
   where u.id = p_uo;
  if not found then
    raise exception 'UO no encontrada' using errcode = 'P0002';
  end if;

  if v_uo.digitalizador_id is null then
    raise warning 'Plan semanal: la UO % no tiene digitalizador; no se proponen fechas', v_uo.referencia_operativa;
    return;
  end if;

  -- No se recalcula sola
  if exists (select 1 from public.plan_carga_uo c where c.uo_id = p_uo) then
    return;
  end if;

  if not exists (select 1 from public.actividades_uo a
                   join public.plantillas_actividad p on p.id = a.plantilla_id
                  where a.uo_id = p_uo and p.momento_creacion = 'asignacion') then
    raise notice 'Plan semanal: la UO % no tiene actividades de asignacion', v_uo.referencia_operativa;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('plan_semanal:' || v_uo.digitalizador_id::text, 0));

  v_minimo := public.plan_parametro('jornada_minima_uo', v_inicio);
  v_bloque := public.plan_parametro('jornadas_pasos_1_3_uo_larga', v_inicio);
  if v_minimo is null or v_minimo <= 0 or v_bloque is null or v_bloque <= 0 then
    raise exception 'Faltan parametros vigentes validos en plan_parametros (jornada_minima_uo > 0, jornadas_pasos_1_3_uo_larga > 0)'
      using errcode = 'P0001';
  end if;

  if public.plan_rendimiento(v_uo.metodo_constructivo, v_inicio) is null then
    raise warning 'Plan semanal: la UO % no tiene metodo constructivo con rendimiento vigente; se usan % jornadas',
      v_uo.referencia_operativa, v_minimo;
  end if;
  v_total := public.plan_jornadas_uo(p_uo, v_inicio);

  v_dia := v_inicio - 1;

  if v_total <= 1 then
    -- UO corta (hasta una jornada completa): en un solo día, sin partir
    loop
      v_dia  := v_dia + 1;
      v_iter := v_iter + 1;
      if v_iter > c_max_dias then
        raise exception 'Sin capacidad para % jornadas en % dias desde %', v_total, c_max_dias, v_inicio using errcode = 'P0001';
      end if;
      v_libre := public.plan_capacidad_dia(v_dia) - public.plan_carga_persona(v_uo.digitalizador_id, v_dia);
      exit when v_libre >= v_total;
    end loop;

    insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
    values (p_uo, v_dia, v_uo.digitalizador_id, v_total);
    v_fin_1_3 := v_dia;
    v_ultimo  := v_dia;
  else
    -- UO larga, bloque de pasos 1 a 3: jornadas fijas, tomando lo libre de cada
    -- día; puede ocupar dos días (p. ej. viernes 0.75 + lunes 0.25)
    v_bloque   := least(v_bloque, v_total);
    v_restante := v_bloque;
    while v_restante > 0 loop
      v_dia  := v_dia + 1;
      v_iter := v_iter + 1;
      if v_iter > c_max_dias then
        raise exception 'Sin capacidad en % dias desde %', c_max_dias, v_inicio using errcode = 'P0001';
      end if;
      v_libre := public.plan_capacidad_dia(v_dia) - public.plan_carga_persona(v_uo.digitalizador_id, v_dia);
      if v_libre > 0 then
        v_tomar := least(v_libre, v_restante);
        insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
        values (p_uo, v_dia, v_uo.digitalizador_id, v_tomar);
        v_restante := v_restante - v_tomar;
      end if;
    end loop;
    v_fin_1_3 := v_dia;
    v_ultimo  := v_dia;

    -- Pulido: el resto, desde el día siguiente al bloque, según lo libre de cada día
    v_restante := v_total - v_bloque;
    while v_restante > 0 loop
      v_dia  := v_dia + 1;
      v_iter := v_iter + 1;
      if v_iter > c_max_dias then
        raise exception 'Sin capacidad en % dias desde %', c_max_dias, v_inicio using errcode = 'P0001';
      end if;
      v_libre := public.plan_capacidad_dia(v_dia) - public.plan_carga_persona(v_uo.digitalizador_id, v_dia);
      if v_libre > 0 then
        v_tomar := least(v_libre, v_restante);
        insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
        values (p_uo, v_dia, v_uo.digitalizador_id, v_tomar);
        v_restante := v_restante - v_tomar;
      end if;
    end loop;
    v_ultimo := v_dia;
  end if;

  -- Último paso (pulido) vence el último día reservado; los demás, el último
  -- día del bloque 1 a 3 (en una UO corta, el mismo día)
  with pasos as (
    select a.id, a.orden, max(a.orden) over (partition by a.ronda) as orden_max
      from public.actividades_uo a
      join public.plantillas_actividad p on p.id = a.plantilla_id
     where a.uo_id = p_uo
       and p.momento_creacion = 'asignacion'
  )
  update public.actividades_uo a
     set fecha_programada = case when s.orden = s.orden_max then v_ultimo else v_fin_1_3 end,
         fecha_origen     = 'propuesta'
    from pasos s
   where a.id = s.id;
end;
$$;

revoke all on function public.proponer_fechas_uo(uuid, date) from public, anon, authenticated;

alter table public.unidades_operativas
  drop column fecha_no_antes_de;

commit;
