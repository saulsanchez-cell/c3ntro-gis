-- Que hace: revisa R1 a R4 solo para SEED-ACT-001 y SEED-ACT-002 (solo lectura).
-- Proyecto: SIGOprueba (iadojhaibxpnirzijivf). NUNCA en produccion.
-- Resultado esperado: 0 filas.
-- Corrido en SIGOprueba (iadojhaibxpnirzijivf) el 2026-10-26: resultado esperado.

-- C2. Consistencia de esas UOs (sin filas = bien)
select * from public.plan_inconsistencias() where referencia in ('SEED-ACT-001', 'SEED-ACT-002');
