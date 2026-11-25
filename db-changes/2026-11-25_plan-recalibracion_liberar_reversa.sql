-- Que hace: reversa del 04b de 2026-11-25_plan-recalibracion: vuelve a poner la carga futura borrada de las 3 UOs; escribe y hace commit.
-- Proyecto: produccion (rtwjwfpaturmbmegwtys).
-- Antes de correrla: reemplazar PEGAR_FILAS_04A por las filas de la columna "para_reversa" del 04a,
--   y quitar la coma de la ultima fila.
-- Resultado esperado: sin filas y sin error. Aborta si alguna de esas fechas ya tiene carga de la UO.
-- Estado: PROPUESTO, NO APLICADO

begin;

insert into public.plan_carga_uo (uo_id, fecha, responsable_id, jornadas)
select u.id, v.fecha::date, v.responsable_id::uuid, v.jornadas::numeric
  from (values
PEGAR_FILAS_04A
       ) as v(referencia, fecha, responsable_id, jornadas)
  join public.unidades_operativas u on u.referencia_operativa = v.referencia;

commit;
