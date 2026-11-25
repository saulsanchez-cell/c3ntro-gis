-- Que hace: PARTE A (solo lectura). Vista previa de la carga que borra el 04b: la carga desde el 2026-11-26
--   de 3 UOs con sus 4 pasos completados (Miguel, Uziel y Ademir). Tambien arma el texto para la reversa.
-- Proyecto: produccion (rtwjwfpaturmbmegwtys).
-- Resultado esperado: filas de las 3 UOs que suman 12.82 (2025-DUR-FED-127), 8.08 (2025-SIN-FED-125)
--   y 1.52 (2025-SIN-FED-124); 22.42 en total. Si no cuadra, no correr el 04b y mandar el resultado.
-- ANTES del 04b: guardar la columna "para_reversa" de todas las filas (se pega en
--   db-changes/2026-11-25_plan-recalibracion_liberar_reversa.sql, en PEGAR_FILAS_04A).

select u.referencia_operativa as referencia,
       pr.nombre               as persona,
       c.fecha,
       c.jornadas,
       sum(c.jornadas) over (partition by u.id) as total_uo,
       format('(%L, %L, %L, %s),', u.referencia_operativa, c.fecha, c.responsable_id, c.jornadas) as para_reversa
  from public.plan_carga_uo c
  join public.unidades_operativas u on u.id = c.uo_id
  left join public.profiles pr on pr.id = c.responsable_id
 where u.referencia_operativa in ('2025-DUR-FED-127', '2025-SIN-FED-125', '2025-SIN-FED-124')
   and c.fecha >= date '2026-11-26'
 order by 1, 3;
