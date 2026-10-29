-- =============================================================================
-- *** SOLO SIGOPRUEBA, NUNCA PRODUCCION ***
-- *** PROPUESTO, NO APLICADO ***
--
-- Datos de ejemplo para ver las dos vistas del Plan semanal (fase 2a).
-- A diferencia del script de pruebas, este SÍ hace commit.
--
-- Corrido en SIGOprueba (iadojhaibxpnirzijivf): AAAA-MM-DD  <-- completar
--
-- Requisitos: 2026-10-23_actividades-uo.sql y 2026-10-26_plan-semanal.sql aplicados.
--
-- Salvaguarda: aborta si hay UOs cuya referencia no empieza con SEED- o PRUEBA-
-- (SIGOprueba no tiene UOs reales; producción sí).
--
-- Deja:
--   Perfiles ficticios SIN usuario de Authentication (nadie puede iniciar
--   sesión con ellos): Ademir, Miguel Ángel y Uziel, digitalizadores, y los
--   tres en plan_integrantes.
--   El perfil del coordinador con su UUID fijo, si no existe (excepción
--   documentada en CLAUDE.md), porque reprogramar escribe un evento con él.
--   8 UOs SEED-PLAN-001..008 asignadas por el trigger, así que las fechas las
--   propone la base:
--     001  Ademir      Subterraneo 40 km (2.29 jornadas: bloque 1-3 de 1.0 +
--          pulido 1.29, barra que cruza días); empezó hace 3 días hábiles;
--          pasos 1 a 3 hechos y el pulido (vence ayer) ATRASADO
--     002  Miguel Ángel Aereo 12 km (0.5), empezó hace 1 día hábil;
--          paso 1 hecho y pasos 2 a 4 ATRASADOS
--     003  Uziel       Mixto 9 km (1.8 jornadas: bloque 1-3 de 1.0 + pulido 0.8)
--     004  Ademir      Aereo 20 km (0.67); el pulido se reprograma +1 día
--          hábil como coordinador (lápiz violeta)
--     005  Miguel Ángel Subterraneo 10 km (0.57)
--     006  Miguel Ángel Aereo 45 km (1.5: bloque 1-3 de 1.0 + pulido 0.5);
--          fecha_entrega_programada = hoy,
--          antes de su última actividad (aviso de la 2a)
--     007  Uziel       sin método constructivo (0.5 y WARNING)
--     008  Ademir      Aereo 9 km (0.5)
--
-- Las fechas dependen del día en que se corra (hoy en México).
--
-- La PARTE 2 (verificación) va aparte: ejecutarla sola después del commit.
--
-- Limpieza (borra las UOs y, por cascada, sus actividades, eventos y carga):
--   delete from public.unidades_operativas where referencia_operativa like 'SEED-PLAN-%';
--   delete from public.plan_integrantes where profile_id in
--     ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000003');
--   delete from public.profiles where id in
--     ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000003');
-- =============================================================================


-- =============================================================================
-- PARTE 1: SEED (escribe y hace commit)
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.plan_carga_uo') is null then
    raise exception 'Primero aplica 2026-10-26_plan-semanal.sql';
  end if;
  if exists (select 1 from public.unidades_operativas
              where referencia_operativa not like 'SEED-%'
                and referencia_operativa not like 'PRUEBA-%') then
    raise exception 'Hay UOs reales en esta base: esto no parece SIGOprueba. Abortado.';
  end if;
  if exists (select 1 from public.unidades_operativas where referencia_operativa like 'SEED-PLAN-%') then
    raise exception 'El seed ya se aplico. Corre la limpieza del encabezado antes de repetirlo.';
  end if;
end $$;

insert into public.profiles (id, nombre, iniciales, rol) values
  ('f0000000-0000-4000-8000-000000000001', 'Ademir',       'AD', 'digitalizador'),
  ('f0000000-0000-4000-8000-000000000002', 'Miguel Ángel', 'MA', 'digitalizador'),
  ('f0000000-0000-4000-8000-000000000003', 'Uziel',        'UZ', 'digitalizador')
on conflict (id) do nothing;

insert into public.profiles (id, nombre, iniciales, rol) values
  ('7063db07-ed16-4ca5-8c98-53b63d128702', 'Coordinador (seed)', 'CO', 'coordinador')
on conflict (id) do nothing;

insert into public.plan_integrantes (profile_id, orden) values
  ('f0000000-0000-4000-8000-000000000001', 1),
  ('f0000000-0000-4000-8000-000000000002', 2),
  ('f0000000-0000-4000-8000-000000000003', 3)
on conflict (profile_id) do nothing;

insert into public.unidades_operativas (referencia_operativa, nombre, tipo_proyecto, estado, metodo_constructivo, km_teoricos) values
  ('SEED-PLAN-001', 'Seed · Fibra Querétaro Norte, troncal subterránea',  'Baseline',   'Pendiente', 'Subterraneo', 40),
  ('SEED-PLAN-002', 'Seed · Ampliación Lomas',                           'Baseline',   'Pendiente', 'Aereo',       12),
  ('SEED-PLAN-003', 'Seed · Backbone Bajío tramo 3',                     'Backbone',   'Pendiente', 'Mixto',       9),
  ('SEED-PLAN-004', 'Seed · Enlace hospital regional',                   'Enterprise', 'Pendiente', 'Aereo',       20),
  ('SEED-PLAN-005', 'Seed · Red corporativa Polanco',                    'Enterprise', 'Pendiente', 'Subterraneo', 10),
  ('SEED-PLAN-006', 'Seed · Anillo Monterrey poniente',                  'Baseline',   'Pendiente', 'Aereo',       45),
  ('SEED-PLAN-007', 'Seed · Data center Apodaca (sin método)',           'Data Center','Pendiente', null,          3),
  ('SEED-PLAN-008', 'Seed · Última milla Coyoacán',                      'Active Line','Pendiente', 'Aereo',       9);

do $$
declare
  v_hoy    date := public.plan_hoy();
  v_ademir uuid := 'f0000000-0000-4000-8000-000000000001';
  v_miguel uuid := 'f0000000-0000-4000-8000-000000000002';
  v_uziel  uuid := 'f0000000-0000-4000-8000-000000000003';
  v_coord  uuid := '7063db07-ed16-4ca5-8c98-53b63d128702';
  r        record;
begin
  -- 1. UOs que empezaron antes de hoy. El trigger propone desde hoy; se
  --    replanifican desde su fecha de asignación para tener días pasados.
  update public.unidades_operativas
     set digitalizador_id = v_ademir, estado = 'Asignada',
         fecha_asignacion = public.plan_sumar_dias_habiles(v_hoy, -3)
   where referencia_operativa = 'SEED-PLAN-001';
  update public.unidades_operativas
     set digitalizador_id = v_miguel, estado = 'Asignada',
         fecha_asignacion = public.plan_sumar_dias_habiles(v_hoy, -1)
   where referencia_operativa = 'SEED-PLAN-002';

  for r in
    select id, fecha_asignacion from public.unidades_operativas
     where referencia_operativa in ('SEED-PLAN-001', 'SEED-PLAN-002')
  loop
    delete from public.plan_carga_uo where uo_id = r.id;
    update public.actividades_uo set fecha_programada = null, fecha_origen = null where uo_id = r.id;
    perform public.proponer_fechas_uo(r.id, r.fecha_asignacion);
  end loop;

  -- 2. El resto, asignado hoy (el trigger propone desde hoy)
  update public.unidades_operativas set digitalizador_id = v_uziel,  estado = 'Asignada', fecha_asignacion = v_hoy where referencia_operativa = 'SEED-PLAN-003';
  update public.unidades_operativas set digitalizador_id = v_ademir, estado = 'Asignada', fecha_asignacion = v_hoy where referencia_operativa = 'SEED-PLAN-004';
  update public.unidades_operativas set digitalizador_id = v_miguel, estado = 'Asignada', fecha_asignacion = v_hoy where referencia_operativa = 'SEED-PLAN-005';
  update public.unidades_operativas set digitalizador_id = v_miguel, estado = 'Asignada', fecha_asignacion = v_hoy where referencia_operativa = 'SEED-PLAN-006';
  update public.unidades_operativas set digitalizador_id = v_uziel,  estado = 'Asignada', fecha_asignacion = v_hoy where referencia_operativa = 'SEED-PLAN-007';
  update public.unidades_operativas set digitalizador_id = v_ademir, estado = 'Asignada', fecha_asignacion = v_hoy where referencia_operativa = 'SEED-PLAN-008';

  -- 3. Avance, por las RPC para que los eventos queden igual que en la UI
  perform set_config('request.jwt.claims', json_build_object('sub', v_ademir, 'role', 'authenticated')::text, true);
  perform public.marcar_actividad(a.id)
     from public.actividades_uo a
     join public.unidades_operativas u on u.id = a.uo_id
    where u.referencia_operativa = 'SEED-PLAN-001' and a.orden <= 3;

  perform set_config('request.jwt.claims', json_build_object('sub', v_miguel, 'role', 'authenticated')::text, true);
  perform public.marcar_actividad(a.id)
     from public.actividades_uo a
     join public.unidades_operativas u on u.id = a.uo_id
    where u.referencia_operativa = 'SEED-PLAN-002' and a.orden = 1;

  -- 4. Ajuste manual como coordinador (lápiz violeta)
  perform set_config('request.jwt.claims', json_build_object('sub', v_coord, 'role', 'authenticated')::text, true);
  perform public.reprogramar_actividad(a.id, public.plan_sumar_dias_habiles(a.fecha_programada, 1),
                                       'Ejemplo del seed: el cliente pidio un dia mas')
     from public.actividades_uo a
     join public.unidades_operativas u on u.id = a.uo_id
    where u.referencia_operativa = 'SEED-PLAN-004' and a.orden = 4;

  perform set_config('request.jwt.claims', '', true);

  -- 5. Entrega programada antes de la última actividad (aviso en la 2a)
  update public.unidades_operativas set fecha_entrega_programada = v_hoy
   where referencia_operativa = 'SEED-PLAN-006';
end $$;

commit;


-- =============================================================================
-- PARTE 2: VERIFICACIÓN (solo lectura). Ejecutar sola, después de la PARTE 1.
-- Cada consulta por separado: el SQL Editor solo muestra la última.
-- =============================================================================

-- 2a. Resumen por UO
select u.referencia_operativa,
       p.nombre                                                    as digitalizador,
       (select sum(c.jornadas) from public.plan_carga_uo c where c.uo_id = u.id) as jornadas,
       (select min(c.fecha)    from public.plan_carga_uo c where c.uo_id = u.id) as desde,
       (select max(c.fecha)    from public.plan_carga_uo c where c.uo_id = u.id) as hasta,
       (select count(*) from public.actividades_uo a where a.uo_id = u.id and a.completada_en is not null) as hechas,
       (select count(*) from public.actividades_uo a
         where a.uo_id = u.id and a.completada_en is null and a.fecha_programada < public.plan_hoy()) as atrasadas,
       (select count(*) from public.actividades_uo a where a.uo_id = u.id and a.fecha_origen = 'ajustada') as ajustadas
  from public.unidades_operativas u
  left join public.profiles p on p.id = u.digitalizador_id
 where u.referencia_operativa like 'SEED-PLAN-%'
 order by u.referencia_operativa;

-- 2b. Consistencia (sin filas = bien)
select * from public.plan_inconsistencias();
