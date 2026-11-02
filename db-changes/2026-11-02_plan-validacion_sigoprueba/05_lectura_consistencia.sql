-- Que hace: revisa las reglas R1 a R4 del plan y V1 a V4 de la validacion (solo lectura). Se corre como postgres en el SQL Editor: las dos funciones no tienen EXECUTE para authenticated.
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf), y despues produccion tal cual. Despues de 01 y otra vez despues de 04b.
-- Resultado esperado: 0 filas. Si hay filas: mandarlas todas.
-- Corrido en SIGOprueba el 2026-11-02: 0 filas despues de 01 y despues de 04b
-- Corrido en produccion el 2026-11-02: 0 filas despues de 01 y despues de 04b

select 'plan' as revision, i.referencia, i.regla from public.plan_inconsistencias() i
union all
select 'validacion', v.referencia, v.regla from public.plan_inconsistencias_validacion() v
order by 1, 2, 3;
