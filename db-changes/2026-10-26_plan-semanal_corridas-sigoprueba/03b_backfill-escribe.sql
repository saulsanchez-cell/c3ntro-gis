-- Que hace: valida y propone fechas para SEED-ACT-001 y SEED-ACT-002; escribe y hace commit.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). NUNCA en produccion.
-- Resultado esperado: sin filas y sin error. Si se corre otra vez, no cambia nada (se salta las UOs ya planeadas).
-- Corrido en SIGOprueba (iadojhaibxpnirzijivf) el 2026-10-26: resultado esperado.

begin;

do $$
declare
  -- Lista de PRUEBA (SIGOprueba). La de produccion esta en 2026-10-26_plan-semanal_backfill.sql.
  v_refs  text[] := array['SEED-ACT-001', 'SEED-ACT-002'];
  v_lista text;
  r       record;
begin
  if to_regclass('public.plan_carga_uo') is null then
    raise exception 'Primero aplica 2026-10-26_plan-semanal.sql';
  end if;

  select string_agg(x.referencia, ', ' order by x.referencia) into v_lista
    from unnest(v_refs) as x(referencia)
   where not exists (select 1 from public.unidades_operativas u where u.referencia_operativa = x.referencia);
  if v_lista is not null then
    raise exception 'Referencias que no existen: %', v_lista;
  end if;

  select string_agg(u.referencia_operativa || ' (' || coalesce(u.estado::text, 'sin estado') || ')', ', ' order by u.referencia_operativa) into v_lista
    from public.unidades_operativas u
   where u.referencia_operativa = any (v_refs)
     and (u.estado is null or u.estado not in ('Asignada', 'En Proceso', 'En Correccion'));
  if v_lista is not null then
    raise exception 'Referencias fuera de Asignada, En Proceso o En Correccion: %', v_lista;
  end if;

  select string_agg(u.referencia_operativa, ', ' order by u.referencia_operativa) into v_lista
    from public.unidades_operativas u
   where u.referencia_operativa = any (v_refs)
     and u.digitalizador_id is null;
  if v_lista is not null then
    raise exception 'Referencias sin digitalizador: %', v_lista;
  end if;

  select string_agg(u.referencia_operativa, ', ' order by u.referencia_operativa) into v_lista
    from public.unidades_operativas u
   where u.referencia_operativa = any (v_refs)
     and not exists (select 1 from public.actividades_uo a
                       join public.plantillas_actividad p on p.id = a.plantilla_id
                      where a.uo_id = u.id and p.momento_creacion = 'asignacion');
  if v_lista is not null then
    raise exception 'Referencias sin actividades de asignacion: %', v_lista;
  end if;

  -- La más antigua primero. proponer_fechas_uo se salta las que ya tienen carga.
  for r in
    select u.id from public.unidades_operativas u
     where u.referencia_operativa = any (v_refs)
     order by u.fecha_asignacion nulls last, u.referencia_operativa
  loop
    perform public.proponer_fechas_uo(r.id);
  end loop;
end $$;

commit;
