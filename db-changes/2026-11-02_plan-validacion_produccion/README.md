# Validación planeada (entrega 2): aplicación en PRODUCCIÓN (rtwjwfpaturmbmegwtys)

Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN (2026-11-02). Pasos 1 a 9 con el resultado esperado; 07 con todo_listo = true (15 validaciones, 15 con fecha).

Cada archivo es una corrida en el SQL Editor de Supabase. Antes de cada una:

- Confirma en la URL del editor que estás en **rtwjwfpaturmbmegwtys** (producción).
- Quita cualquier texto seleccionado: si hay selección, solo se ejecuta la selección.
- El editor solo muestra el resultado de la última consulta; por eso cada archivo de lectura tiene una sola.

Los scripts **no están copiados aquí**. Se corren tal cual, sin editar, desde `../2026-11-02_plan-validacion_sigoprueba/`:

- Cambio: `01_escribe_cambio.sql`
- Backfill: `04a_lectura_backfill-vista-previa.sql` (lectura) y `04b_escribe_backfill.sql` (escribe)
- Nadie se autovalida (trigger): `06_escribe_check-no-autovalidacion.sql`
- Reversa (solo si hace falta): `../2026-11-02_plan-validacion_reversa.sql`

No se corren en producción las pruebas (`02_pruebas_rollback.sql`).

## Reglas de esta aplicación

1. **El SQL va primero.** El frontend de la entrega 3 no se fusiona hasta que los pasos 1 a 7 salgan bien.
2. **Nadie asigna UOs, cambia analistas ni valida durante la aplicación.** Avisa al equipo antes del paso 1 y libera al terminar el paso 7.
3. **Para revertir:** si la entrega 3 ya se fusionó, primero se revierte el frontend y **después** se corre la reversa independiente.

## Orden

| Paso | Archivo | Escribe | Qué esperar | Qué me mandas |
|---|---|---|---|---|
| 0 | Aviso al equipo | — | — | — |
| 1 | `00_lectura_previa.sql` | No | 1 fila, todo en `true`, `todo_listo = true` | La fila completa. Si algo sale `false`: **detente**. |
| 1b | `00b_lectura_analista-igual-digitalizador.sql` (esta carpeta) | No | 8 filas (7 Cerradas, 1 Validada; ninguna entra al backfill) | Solo si cambia algo |
| 2 | **`01_escribe_cambio.sql`** | **Sí** | Sin filas y sin error | Solo si hay error: el mensaje completo |
| 3 | `03_lectura_permisos.sql` | No | 10 filas, todas con `ok = true` y las mismas huellas que SIGOprueba (anotadas en el encabezado del 03) | Las 10 filas |
| 4 | `05_lectura_consistencia.sql` | No | 0 filas | Si hay filas: todas |
| 5 | `04a_lectura_backfill-vista-previa.sql` | No | Una fila por UO activa sin validación | Todas las filas. **Espera mi visto bueno antes del paso 6.** |
| 6 | **`04b_escribe_backfill.sql`** | **Sí** | Sin filas; NOTICE con las creadas y las que tienen fecha, iguales a lo que dijo el paso 5 | Los dos NOTICE |
| 7 | `05_lectura_consistencia.sql` otra vez | No | 0 filas | Si hay filas: todas |
| 8 | **`06_escribe_check-no-autovalidacion.sql`** | **Sí** | Sin filas y sin error | Solo si hay error |
| 9 | `07_lectura_verificacion-final.sql` (esta carpeta) | No | 1 fila, `todo_listo = true` (15 validaciones, 15 con fecha) | La fila |
| 10 | Anotar fechas en los encabezados y en CLAUDE.md; commit con las fechas | — | — | Confirmación |

## Si algo sale mal

- **Paso 1 con `false`:** producción no está como SIGOprueba antes del cambio. No corras el paso 2; mándame la fila.
- **Paso 2 con error:** el archivo va dentro de `begin … commit` y el editor deshace todo si falla. Mándame el error.
- **Pasos 3, 4 o 7 no coinciden:** no sigas. Mándame el resultado. Como el frontend no ha cambiado, se puede correr la reversa directamente.
- **Paso 6 con error:** no queda nada escrito. Mándame el mensaje.
- **Paso 8 con error:** el resto queda aplicado y no hace falta revertirlo. Mándame el mensaje.

## Qué cambia en la app antes de la entrega 3

- **FichaUO:** la lista de actividades muestra la quinta, "Validación de calidad". Si el analista o el coordinador pulsan MARCAR, sale el error "La validacion de calidad no se marca a mano: se cierra sola cuando la UO pasa a Validada". Se cierra sola al validar en el checklist.
- **Plan semanal, vista Plan:** las tarjetas y los KPI de planeadas y hechas siguen contando solo los pasos 1 a 4. Una validación atrasada sí aparece en la lista de atrasos, y en el KPI de atrasadas, si el analista es integrante del plan.
- **Plan semanal, vista Carga y "Dónde asignar":** todavía no suman la carga de la validación. La propuesta del servidor sí la cuenta, así que una asignación puede caer un día después de lo que sugiere "Dónde asignar".
- **REPROGRAMAR:** la validación aparece en la lista. La vista previa del modal puede mostrar que se mueve la carga del digitalizador, pero el servidor mueve solo la de la validación.
- **Con el paso 8:** si en FichaUO se pone a la misma persona como digitalizador y como analista QA, el guardado completo falla con el alert "No se pudo guardar la asignacion: El analista QA no puede ser el mismo digitalizador (nadie se autovalida)". Las 8 UOs viejas con la misma persona se siguen editando y cerrando normal.
