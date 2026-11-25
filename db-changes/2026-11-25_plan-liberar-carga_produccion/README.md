# Liberar la carga al completar los 4 pasos: pasos

**Estado: APLICADO EN SIGOPRUEBA Y PRODUCCIÓN el 2026-11-25.** En SIGOprueba, el `03` (4 filas con `ok = true`) y la auditoría (0 filas) se verificaron por MCP. En producción, el `03` dio 4 filas con `ok = true` y las mismas huellas (reportado por Saúl); la auditoría de seguridad también salió bien (confirmado por Saúl, sin pegar el resultado).

Qué hace: cuando el digitalizador completa el último de sus 4 pasos, la carga de la UO desde mañana se borra sola y queda registrada en `plan_carga_liberada`. Si después se desmarca un paso, la carga liberada que siga siendo de mañana en adelante se devuelve. La carga de hoy y la de días pasados, las fechas de los pasos y la validación del analista no se tocan.

Se corre en el SQL Editor, un archivo a la vez y sin texto seleccionado. Archivos en `../2026-11-25_plan-liberar-carga_sigoprueba/`.

## 1. SIGOprueba (`iadojhaibxpnirzijivf`)

Requisito: los valores nuevos del plan ya aplicados (`2026-11-25_plan-recalibracion`): las pruebas cuentan con Mixto 35.

| Paso | Archivo | Resultado esperado |
|---|---|---|
| 1 | `00_lectura_previa.sql` | 1 fila con `todo_listo = true`. Mandar la fila (trae la huella actual de `plan_inconsistencias`). |
| 2 | `01_escribe_cambio.sql` | Sin filas y sin error. |
| 3 | `02_pruebas_rollback.sql` | `OK: todas las pruebas pasaron (12)`. |
| 4 | `03_lectura_permisos.sql` | 4 filas con `ok = true`. Mandar las huellas. |

## 2. Producción (`rtwjwfpaturmbmegwtys`)

| Paso | Archivo | Resultado esperado |
|---|---|---|
| 5 | `00_lectura_previa.sql` | `todo_listo = true` y `huella_plan_inconsistencias` = `fd6ce5846deb798b67810cc3c35a8130` (la de SIGOprueba antes del cambio). |
| 6 | `01_escribe_cambio.sql` | Sin filas y sin error. |
| 7 | `03_lectura_permisos.sql` | 4 filas con `ok = true` y **las mismas huellas** que en SIGOprueba: `desmarcar_actividad` `5f9dc13ccd46630f0d1202b1bb4e3a97`, `marcar_actividad` `a4ae7396e16ac1b76340de3ce436aec1`, `plan_inconsistencias` `e5509825b1b0dc8e41b112055b607e9b`. |
| 8 | `../2026-11-02_seguridad-anon-y-profiles_sigoprueba/03_lectura_auditoria-seguridad.sql` | Solo filas con `conocido = true`. |

No se corre en producción: `02_pruebas_rollback.sql` (crea perfiles y UOs ficticios, aunque termine en `rollback`).

## 3. Prueba en la app (producción)

La próxima vez que un integrante complete el paso 4 de una UO antes de lo planeado, en Plan semanal (vista Carga) debe verse libre desde el día siguiente. No hace falta forzar una prueba de escritura.

## Después
- Anotar las fechas en el encabezado del `01` y en este README, y las huellas en CLAUDE.md.
- Recién entonces se fusiona el PR (incluye el cambio de la vista Carga: libre y "Dónde asignar" de hoy en adelante).

## Reversa
`../2026-11-25_plan-liberar-carga_reversa.sql`. Antes se revierte el frontend. La carga ya liberada no regresa; si hace falta, guardar antes `plan_carga_liberada`.
