-- Parte B. Que hace: borra la UO 2025-SON-FED-028.1, repetida de 2025-SON-FED-028 (escritura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys). Correr solo si 00 dio lista = true y ya se guardo fila_json.
-- Resultado esperado: "Success. No rows returned" y un aviso "Borrada: 2025-SON-FED-028.1".
-- Vuelve a revisar todo dentro de la transaccion: si la UO tiene algo que dependa de ella
-- (logs, historial, checklists, borradores, distancia, actividades o carga del plan), falla y no borra nada.
-- Esas tablas se borran en cascada con la UO; por eso se exige que esten vacias.
-- Reversa: db-changes/2026-11-13_borrar-uo-son-fed-028-1_reversa.sql (necesita fila_json de 00).
-- Estado: APLICADO EN PRODUCCIÓN el 2026-11-13.

begin;

do $$
declare
  v_id    uuid;
  v_dep   bigint;
  v_filas integer;
begin
  select u.id into v_id
    from public.unidades_operativas u
   where u.referencia_operativa = '2025-SON-FED-028.1';

  if v_id is null then
    raise exception 'No existe la UO 2025-SON-FED-028.1. No se borro nada.';
  end if;

  select (select count(*) from public.logs_actividad x       where x.uo_id = v_id)
       + (select count(*) from public.historial_estados x    where x.uo_id = v_id)
       + (select count(*) from public.checklist_resultados x where x.uo_id = v_id)
       + (select count(*) from public.checklist_borradores x where x.uo_id = v_id)
       + (select count(*) from public.log_distancia x        where x.uo_id = v_id)
       + (select count(*) from public.actividades_uo x       where x.uo_id = v_id)
       + (select count(*) from public.plan_carga_uo x        where x.uo_id = v_id)
    into v_dep;

  if v_dep <> 0 then
    raise exception 'La UO 2025-SON-FED-028.1 tiene % registros que dependen de ella. No se borro nada.', v_dep;
  end if;

  delete from public.unidades_operativas where id = v_id;
  get diagnostics v_filas = row_count;

  if v_filas <> 1 then
    raise exception 'Se esperaba borrar 1 UO y se borrarian %. No se borro nada.', v_filas;
  end if;

  raise notice 'Borrada: 2025-SON-FED-028.1';
end
$$;

commit;
