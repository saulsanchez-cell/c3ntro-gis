-- Que hace: revisa las reglas R1 a R4 del plan semanal con plan_inconsistencias() despues del cambio (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf).
-- Resultado esperado: 0 filas. Si hay filas, mandarlas completas.
-- Corrido en SIGOprueba el 2026-10-29: resultado esperado

select * from public.plan_inconsistencias();
