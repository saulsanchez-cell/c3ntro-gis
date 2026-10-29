-- Que hace: revisa las reglas R1 a R4 con plan_inconsistencias() (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). NUNCA en produccion.
-- Resultado esperado: 0 filas.
-- Corrido en SIGOprueba (iadojhaibxpnirzijivf) el 2026-10-26: resultado esperado.

-- 2b. Consistencia (sin filas = bien)
select * from public.plan_inconsistencias();
