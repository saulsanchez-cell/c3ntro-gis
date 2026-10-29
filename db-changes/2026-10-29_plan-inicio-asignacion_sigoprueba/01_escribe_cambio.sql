-- Que hace: agrega unidades_operativas.fecha_no_antes_de (date, acepta nulos, sin default) y hace que proponer_fechas_uo empiece en greatest(coalesce(p_inicio, plan_hoy()), fecha_no_antes_de); escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). Reversa: db-changes/2026-10-29_plan-inicio-asignacion_reversa.sql (antes, revertir el frontend).
-- Resultado esperado: sin filas y sin error. Si aborta porque la columna ya existe o porque proponer_fechas_uo no es la medida, no queda nada escrito: mandar el mensaje completo.
-- Estado: APLICADO EN SIGOPRUEBA, PENDIENTE EN PRODUCCIÓN
-- Aplicado en SIGOprueba (iadojhaibxpnirzijivf): 2026-10-29
-- Aplicado en producción (rtwjwfpaturmbmegwtys): PENDIENTE

begin;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'unidades_operativas'
                and column_name = 'fecha_no_antes_de') then
    raise exception 'La columna unidades_operativas.fecha_no_antes_de ya existe. Abortado.';
  end if;
  if md5(replace(pg_get_functiondef('public.proponer_fechas_uo(uuid,date)'::regprocedure), E'\r', ''))
       is distinct from '5a907348c2626b4c083433688c99b686' then
    raise exception 'proponer_fechas_uo no es la version de 2026-10-26_plan-semanal.sql (md5 distinto). Abortado.';
  end if;
end $$;

alter table public.unidades_operativas
  add column fecha_no_antes_de date;

comment on column public.unidades_operativas.fecha_no_antes_de is
  'Plan semanal: al asignar, la propuesta de fechas no empieza antes de este dia. Opcional. Solo se usa al proponer; cambiarla despues no recalcula nada.';

create or replace function public.proponer_fechas_uo(p_uo uuid, p_inicio date default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_dias constant int := 366;
  v_inicio   date;
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
  select u.id, u.referencia_operativa, u.digitalizador_id, u.metodo_constructivo, u.km_teoricos,
         u.fecha_no_antes_de
    into v_uo
    from public.unidades_operativas u
   where u.id = p_uo;
  if not found then
    raise exception 'UO no encontrada' using errcode = 'P0002';
  end if;

  v_inicio := greatest(coalesce(p_inicio, public.plan_hoy()), v_uo.fecha_no_antes_de);

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

commit;
