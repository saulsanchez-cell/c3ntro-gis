Aplicado en producción el 2026-10-29: pasos 1 a 4 con el resultado esperado.

# Días inhábiles (descanso obligatorio): aplicación en PRODUCCIÓN (rtwjwfpaturmbmegwtys)

Solo datos: 7 filas en `plan_dias_inhabiles`. No cambia funciones ni frontend.

| Fecha | Día | Motivo |
|---|---|---|
| 2026-11-16 | lunes | Aniversario de la Revolución Mexicana |
| 2026-12-25 | viernes | Navidad |
| 2027-01-01 | viernes | Año Nuevo |
| 2027-02-01 | lunes | Día de la Constitución |
| 2027-03-15 | lunes | Natalicio de Benito Juárez |
| 2027-09-16 | jueves | Día de la Independencia |
| 2027-11-15 | lunes | Aniversario de la Revolución Mexicana |

Cada archivo es una corrida en el SQL Editor de Supabase. Antes de cada una:

- Confirma en la URL del editor que estás en **rtwjwfpaturmbmegwtys** (producción).
- Quita cualquier texto seleccionado: si hay selección, solo se ejecuta la selección.
- El editor solo muestra el resultado de la última consulta; por eso cada archivo de lectura tiene una sola.

El cambio **no está copiado aquí**. Se corre tal cual, sin editar:

- Cambio: `db-changes/2026-10-29_plan-dias-inhabiles_sigoprueba/01_escribe_dias-inhabiles.sql`
- Reversa (solo si hace falta): `db-changes/2026-10-29_plan-dias-inhabiles_reversa.sql`

No se corre en producción la prueba `04_pruebas_rollback.sql` de la carpeta `_sigoprueba`.

## Qué cambia y qué no

- Desde que se aplica, `plan_capacidad_dia` da 0 en esas fechas: las **nuevas** propuestas de fechas (al asignar) y los **nuevos** REPROGRAMAR las saltan.
- **Lo ya programado no se mueve solo.** Si alguna actividad o carga ya cae en una de esas fechas, el paso 4 la muestra; las pendientes se mueven a mano con REPROGRAMAR en Plan semanal.
- Mientras corre el paso 2, una asignación simultánea podría proponer con el calendario anterior. Es una inserción de 7 filas que dura un instante; basta con no asignar mientras lo corres.

## Orden

| Paso | Archivo | Escribe | Qué esperar | Qué me mandas |
|---|---|---|---|---|
| 1 | `00_lectura_previa.sql` | No | 1 fila, `ya_cargadas = 0`, `todo_listo = true` | La fila (quiero ver `total_en_tabla`). Si `ya_cargadas > 0`: **detente** |
| 2 | **`../2026-10-29_plan-dias-inhabiles_sigoprueba/01_escribe_dias-inhabiles.sql`** (tal cual) | **Sí** | Sin filas y sin error | Solo si hay error: el mensaje completo |
| 3 | `02_lectura_capacidad.sql` | No | 7 filas con `ok = true` | Solo si alguna sale `false`: esa fila |
| 4 | `03_lectura_actividades-y-carga.sql` | No | Idealmente 0 filas | Si hay filas: todas |

## Si algo sale mal

- **Paso 1 con `ya_cargadas > 0`:** alguien ya cargó alguna de esas fechas. El 01 no la sobrescribiría (on conflict do nothing) y la reversa no la borraría (compara la descripción). Mándame la fila y decidimos.
- **Paso 2 con error:** va dentro de `begin … commit`; el editor deshace todo si falla. Mándame el error.
- **Paso 3 con `ok = false`:** mira qué columna falla. Si es `cap_anterior` o `cap_posterior`, la capacidad de producción no es la semilla (1 lunes a jueves, 0.75 viernes); si es `capacidad`, la fecha no quedó cargada. Mándame la fila.
- **Paso 4 con filas:** no es un error del cambio; son UOs programadas antes en un día que ahora es inhábil. Mándamelas; las pendientes se mueven con REPROGRAMAR.
- **Revertir:** correr la reversa tal cual. Solo borra estas 7 fechas con su descripción; no hay frontend que revertir.

## Después

- Con los 4 pasos en verde: actualizar el encabezado de `../2026-10-29_plan-dias-inhabiles_sigoprueba/01_escribe_dias-inhabiles.sql` (marca `APLICADO EN SIGOPRUEBA Y PRODUCCIÓN` y fechas) y anotar arriba de este README la fecha de aplicación. Luego el commit con las fechas.

## Pendiente: feriados judíos

Los feriados judíos se cargarán después, **en un archivo por año** (por ejemplo `AAAA-MM-DD_plan-dias-inhabiles-judios-2027`), con el mismo patrón: lectura previa, escritura con `on conflict do nothing`, lectura de capacidad, lectura de actividades y carga, y reversa que borre solo esas fechas. Este cambio no los incluye.
