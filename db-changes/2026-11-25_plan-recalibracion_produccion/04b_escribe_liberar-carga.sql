-- Que hace: PARTE B (escribe y hace commit). Borra la carga desde el 2026-11-26 de 3 UOs que ya completaron sus 4 pasos:
--   2025-DUR-FED-127 (Miguel, 12.82), 2025-SIN-FED-125 (Uziel, 8.08) y 2025-SIN-FED-124 (Ademir, 1.52).
-- Proyecto: solo produccion (rtwjwfpaturmbmegwtys). Es un cambio de datos que no existe en SIGOprueba.
-- Requisito: correr antes el 04a y guardar su columna "para_reversa".
-- Reversa: db-changes/2026-11-25_plan-recalibracion_liberar_reversa.sql
-- Resultado esperado: sin filas y sin error. Si aborta, no queda nada escrito: mandar el mensaje completo.
-- Estado: APLICADO EN PRODUCCIÓN
-- Aplicado en producción (rtwjwfpaturmbmegwtys): 2026-11-25 (04c: carga_futura 0 y 2.0 hasta el 25 en las 3 UOs)
--
-- Decisiones de Saul (2026-11-25):
--   - Solo Miguel, Uziel y Ademir estan en el plan semanal. Las UOs de otros usuarios
--     (Angel, Martin, Jorge) son cargas a Vetro que hace el coordinador: no se tocan.
--   - Se conserva la carga hasta el 2026-11-25 (2.0 en cada UO): es el trabajo hecho y
--     el credito del KPI de produccion. Solo se borra la carga futura.
--   - No se tocan las fechas de los pasos (puntualidad) ni la carga de la validacion
--     (plan_carga_actividad: es del analista y sigue pendiente).
--
-- Efecto: esas jornadas quedan libres en "Carga" y "Donde asignar" para Miguel, Uziel y Ademir.
-- Diagnostico: R2 y R4 de plan_inconsistencias() marcaran estas 3 UOs (el ultimo paso ya no
--   vence el ultimo dia de carga y la suma no es la de la formula). La app no lo usa; se
--   resuelve con el cambio de liberar la carga al completar el paso 4.

begin;

do $$
declare
  v_esperado constant jsonb := '{"2025-DUR-FED-127": 12.82, "2025-SIN-FED-125": 8.08, "2025-SIN-FED-124": 1.52}';
  v_ref   text;
  v_suma  numeric;
  v_pend  int;
  v_borradas int;
begin
  for v_ref in select jsonb_object_keys(v_esperado) loop
    select coalesce(sum(c.jornadas), 0) into v_suma
      from public.plan_carga_uo c
      join public.unidades_operativas u on u.id = c.uo_id
     where u.referencia_operativa = v_ref
       and c.fecha >= date '2026-11-26';
    if v_suma <> (v_esperado ->> v_ref)::numeric then
      raise exception 'La carga futura de % es % y se esperaba %. Abortado.', v_ref, v_suma, v_esperado ->> v_ref;
    end if;

    select count(*) filter (where a.completada_en is null) into v_pend
      from public.actividades_uo a
      join public.plantillas_actividad p on p.id = a.plantilla_id
      join public.unidades_operativas u on u.id = a.uo_id
     where u.referencia_operativa = v_ref
       and p.momento_creacion = 'asignacion';
    if v_pend <> 0 then
      raise exception '% tiene % pasos sin completar. Abortado.', v_ref, v_pend;
    end if;
  end loop;

  delete from public.plan_carga_uo c
   using public.unidades_operativas u
   where u.id = c.uo_id
     and u.referencia_operativa in ('2025-DUR-FED-127', '2025-SIN-FED-125', '2025-SIN-FED-124')
     and c.fecha >= date '2026-11-26';
  get diagnostics v_borradas = row_count;

  raise notice 'OK   carga liberada: % filas, 22.42 jornadas', v_borradas;
end;
$$;

commit;
