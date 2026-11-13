-- Parte B. Que hace: borra la UO 1285, que quedo obsoleta porque el trabajo se hizo en 1285.1 y 1285.2 (escritura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys). Correr solo si 00 dio lista = true y ya se guardo fila_json.
-- Resultado esperado: "Success. No rows returned" y un aviso "Borrada: 1285".
-- Vuelve a revisar todo dentro de la transaccion: si la UO ya no esta Pendiente o tiene algo que dependa de ella
-- (logs, historial, checklists, borradores, distancia, actividades o carga del plan), falla y no borra nada.
-- Esas tablas se borran en cascada con la UO; por eso se exige que esten vacias.
-- Reversa: db-changes/2026-11-13_borrar-uo-1285_reversa.sql (necesita fila_json de 00).
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
   where u.referencia_operativa = '1285'
     and u.estado = 'Pendiente';

  if v_id is null then
    raise exception 'No existe la UO 1285 en estado Pendiente. No se borro nada.';
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
    raise exception 'La UO 1285 tiene % registros que dependen de ella. No se borro nada.', v_dep;
  end if;

  delete from public.unidades_operativas where id = v_id;
  get diagnostics v_filas = row_count;

  if v_filas <> 1 then
    raise exception 'Se esperaba borrar 1 UO y se borrarian %. No se borro nada.', v_filas;
  end if;

  raise notice 'Borrada: 1285';
end
$$;

commit;
