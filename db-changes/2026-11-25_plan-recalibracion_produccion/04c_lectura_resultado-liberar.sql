-- Que hace: verifica el 04b (solo lectura): las 3 UOs ya no tienen carga desde el 2026-11-26 y conservan la de antes.
-- Proyecto: produccion (rtwjwfpaturmbmegwtys).
-- Resultado esperado: 3 filas con carga_futura = 0 y carga_hasta_el_25 = 2.0 en cada una.

select u.referencia_operativa as referencia,
       coalesce(sum(c.jornadas) filter (where c.fecha >= date '2026-11-26'), 0) as carga_futura,
       coalesce(sum(c.jornadas) filter (where c.fecha <  date '2026-11-26'), 0) as carga_hasta_el_25
  from public.unidades_operativas u
  left join public.plan_carga_uo c on c.uo_id = u.id
 where u.referencia_operativa in ('2025-DUR-FED-127', '2025-SIN-FED-125', '2025-SIN-FED-124')
 group by 1
 order by 1;
