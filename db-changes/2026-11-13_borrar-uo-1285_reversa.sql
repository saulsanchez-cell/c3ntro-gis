-- Reversa de 2026-11-13_borrar-uo-1285_produccion/01: vuelve a crear la UO 1285 con sus valores originales (escritura).
-- Proyecto: PRODUCCIÓN (rtwjwfpaturmbmegwtys).
-- Antes de correr: reemplazar PEGAR_FILA_JSON por la columna fila_json que dio 00 (el JSON completo, entre las comillas simples).
-- Resultado esperado: "Success. No rows returned" y un aviso "Restaurada: 1285".
-- Usa el mismo id de antes. Si la referencia 1285 ya existe, falla y no inserta nada.
-- Estado: PROPUESTO, NO APLICADO (no lleva fecha hasta que se aplique).

begin;

do $$
declare
  v_fila public.unidades_operativas;
begin
  v_fila := jsonb_populate_record(null::public.unidades_operativas, 'PEGAR_FILA_JSON'::jsonb);

  if v_fila.referencia_operativa is distinct from '1285' then
    raise exception 'El JSON pegado no es de la UO 1285 (es %). No se inserto nada.', v_fila.referencia_operativa;
  end if;

  if exists (select 1 from public.unidades_operativas where referencia_operativa = '1285' or id = v_fila.id) then
    raise exception 'La UO 1285 ya existe. No se inserto nada.';
  end if;

  insert into public.unidades_operativas select v_fila.*;

  raise notice 'Restaurada: 1285';
end
$$;

commit;
