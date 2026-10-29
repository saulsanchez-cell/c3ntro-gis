-- Que hace: comprueba que ninguna de las 7 fechas (2026-11-16, 2026-12-25, 2027-01-01, 2027-02-01, 2027-03-15, 2027-09-16, 2027-11-15) esta cargada en plan_dias_inhabiles y cuenta las filas que ya tiene la tabla (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf).
-- Resultado esperado: 1 fila con ya_cargadas = 0 y todo_listo = true; total_en_tabla = 0 (el 2026-10-29 estaba vacia). Si ya_cargadas > 0, NO seguir: mandar la fila.
-- Corrido en SIGOprueba el 2026-10-29: resultado esperado

select count(i.fecha)                       as ya_cargadas,
       string_agg(i.fecha::text, ', ')      as cuales,
       (select count(*) from public.plan_dias_inhabiles) as total_en_tabla,
       count(i.fecha) = 0                   as todo_listo
  from (values ('2026-11-16'::date), ('2026-12-25'::date), ('2027-01-01'::date), ('2027-02-01'::date),
               ('2027-03-15'::date), ('2027-09-16'::date), ('2027-11-15'::date)) as f(fecha)
  left join public.plan_dias_inhabiles i on i.fecha = f.fecha;
