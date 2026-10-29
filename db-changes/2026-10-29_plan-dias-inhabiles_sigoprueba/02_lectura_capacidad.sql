-- Que hace: por cada una de las 7 fechas revisa plan_capacidad_dia = 0, la capacidad normal del dia habil anterior y del posterior, y que plan_sumar_dias_habiles y plan_dias_habiles_entre saltan la fecha (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf).
-- Resultado esperado: 7 filas con capacidad = 0, cap_anterior = esperado_anterior, cap_posterior = esperado_posterior (1 lunes a jueves, 0.75 viernes), sumar_ok, entre_ok y ok en true.
-- Corrido en SIGOprueba el 2026-10-29: resultado esperado

select f.fecha,
       i.descripcion,
       public.plan_capacidad_dia(f.fecha)                           as capacidad,
       f.anterior,
       public.plan_capacidad_dia(f.anterior)                        as cap_anterior,
       f.esperado_anterior,
       f.posterior,
       public.plan_capacidad_dia(f.posterior)                       as cap_posterior,
       f.esperado_posterior,
       public.plan_sumar_dias_habiles(f.anterior, 1) = f.posterior  as sumar_ok,
       public.plan_dias_habiles_entre(f.anterior, f.posterior) = 1  as entre_ok,
       (i.fecha is not null
        and public.plan_capacidad_dia(f.fecha) = 0
        and public.plan_capacidad_dia(f.anterior) = f.esperado_anterior
        and public.plan_capacidad_dia(f.posterior) = f.esperado_posterior
        and public.plan_sumar_dias_habiles(f.anterior, 1) = f.posterior
        and public.plan_dias_habiles_entre(f.anterior, f.posterior) = 1) as ok
  from (values ('2026-11-16'::date, '2026-11-13'::date, 0.75, '2026-11-17'::date, 1.00),
               ('2026-12-25'::date, '2026-12-24'::date, 1.00, '2026-12-28'::date, 1.00),
               ('2027-01-01'::date, '2026-12-31'::date, 1.00, '2027-01-04'::date, 1.00),
               ('2027-02-01'::date, '2027-01-29'::date, 0.75, '2027-02-02'::date, 1.00),
               ('2027-03-15'::date, '2027-03-12'::date, 0.75, '2027-03-16'::date, 1.00),
               ('2027-09-16'::date, '2027-09-15'::date, 1.00, '2027-09-17'::date, 0.75),
               ('2027-11-15'::date, '2027-11-12'::date, 0.75, '2027-11-16'::date, 1.00)
       ) as f(fecha, anterior, esperado_anterior, posterior, esperado_posterior)
  left join public.plan_dias_inhabiles i on i.fecha = f.fecha
 order by f.fecha;
